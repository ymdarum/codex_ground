/* Todo Breeze - no backend, localStorage-only PWA */
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  const storeKey = "tb.tasks.v1";
  const themeKey = "tb.theme";
  let tasks = loadTasks();
  let dragTaskId = null;
  const recurrenceValues = new Set(["daily","weekly","monthly"]);

  const addForm = $("#addForm");
  const titleInput = $("#titleInput");
  const dueInput = $("#dueInput");
  const priorityInput = $("#priorityInput");
  const tagsInput = $("#tagsInput");
  const subtasksInput = $("#subtasksInput");
  const recurrenceInput = $("#recurrenceInput");
  const imageInput = $("#imageInput");
  const listEl = $("#taskList");
  const emptyState = $("#emptyState");

  const searchInput = $("#searchInput");
  const filterTag = $("#filterTag");
  const filterWhen = $("#filterWhen");
  const sortBy = $("#sortBy");

  const exportBtn = $("#exportBtn");
  const icsExportBtn = $("#icsExportBtn");
  const importFile = $("#importFile");
  const seedBtn = $("#seedBtn");
  const themeToggle = $("#themeToggle");
  // Theme
  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === "light") document.documentElement.classList.add("light");
  themeToggle.textContent = document.documentElement.classList.contains("light") ? "☀️" : "🌙";
  themeToggle.addEventListener("click", () => {
    document.documentElement.classList.toggle("light");
    const light = document.documentElement.classList.contains("light");
    localStorage.setItem(themeKey, light ? "light" : "dark");
    themeToggle.textContent = light ? "☀️" : "🌙";
  });

  initPersistenceControls();

  // Add task
  addForm.addEventListener("submit", async e => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if(!title) return;
    const due = dueInput.value || null;
    const priority = priorityInput.value;
    const extraTags = parseTags(tagsInput.value);
    const titleTags = parseHashtags(title);
    const allTags = Array.from(new Set([...titleTags, ...extraTags]));
    const parsedSubtasks = parseSubtaskLines(subtasksInput?.value || "");
    const recurrenceRaw = recurrenceInput?.value;
    const recurrence = recurrenceRaw && recurrenceRaw !== "none" ? recurrenceRaw : null;

    let attachment = null;
    const file = imageInput?.files?.[0];
    if (file) {
      try {
        const dataUrl = await fileToDataURL(file);
        attachment = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: dataUrl
        };
      } catch(err) {
        alert("Could not read image: " + err.message);
        return;
      }
    }

    const now = Date.now();
    const created = normalizeTask({
      id: makeId(),
      title,
      notes: "",
      due,
      priority,
      tags: allTags,
      completed: false,
      subtasks: parsedSubtasks,
      recurrence,
      createdAt: now,
      updatedAt: now,
      attachment
    });
    created.createdAt = now;
    created.updatedAt = now;
    created.position = getNextPosition();
    tasks.push(created);
    saveTasks();
    addForm.reset();
    if (imageInput) imageInput.value = "";
    if (recurrenceInput) recurrenceInput.value = "none";
    render();
  });

  // Export / Import
  exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "todo-breeze-tasks.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  if (icsExportBtn) {
    icsExportBtn.addEventListener("click", () => {
      const ics = buildICS(tasks);
      const blob = new Blob([ics], {type: "text/calendar"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "todo-breeze-reminders.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if(!Array.isArray(imported)) throw new Error("Invalid file format");
      const now = Date.now();
      const merged = new Map(tasks.map(t => [t.id, normalizeTask(t)]));
      for (const raw of imported) {
        const task = typeof raw === "object" && raw ? {...raw} : {};
        task.id = typeof task.id === "string" && task.id ? task.id : makeId();
        const existing = merged.get(task.id);
        const normalized = normalizeTask({...existing, ...task, id: task.id});
        normalized.createdAt = existing?.createdAt ?? normalized.createdAt ?? now;
        normalized.updatedAt = now;
        merged.set(normalized.id, normalized);
      }
      tasks = Array.from(merged.values());
      saveTasks();
      render();
    } catch(err){
      alert("Import failed: " + err.message);
    } finally {
      e.target.value = "";
    }
  });

  // Seed data
  if (seedBtn) {
    seedBtn.addEventListener("click", async () => {
      try{
        const res = await fetch("./data/sample-tasks.json");
        const sample = await res.json();
        tasks = sample.map(entry => {
          const raw = typeof entry === "object" && entry ? {...entry} : {};
          raw.id = typeof raw.id === "string" && raw.id ? raw.id : makeId();
          return normalizeTask(raw);
        });
        saveTasks();
        render();
      }catch(err){
        alert("Could not load sample data offline. Try again once the app is installed and cached.");
      }
    });
  }

  // Filters
  [searchInput, filterTag, filterWhen, sortBy].forEach(el => el.addEventListener("input", render));

  function render(){
    const all = tasks.slice().sort((a,b) => (a.position || 0) - (b.position || 0));
    const query = (searchInput.value || "").toLowerCase().trim();
    const tag = (filterTag.value || "").trim();
    const when = filterWhen.value;

    let filtered = all.filter(t => {
      const tagList = Array.isArray(t.tags) ? t.tags : [];
      const subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
      const q = !query || (
        t.title.toLowerCase().includes(query) ||
        (t.notes||"").toLowerCase().includes(query) ||
        tagList.some(x => x.toLowerCase().includes(query)) ||
        subtasks.some(st => (st.title || "").toLowerCase().includes(query))
      );
      const tagOk = !tag || tagList.includes(tag);
      let whenOk = true;
      const todayStr = new Date().toISOString().slice(0,10);
      if (when === "completed") whenOk = t.completed;
      if (when === "active") whenOk = !t.completed;
      if (when === "today") whenOk = !!t.due && t.due === todayStr;
      if (when === "overdue") whenOk = !!t.due && t.due < todayStr && !t.completed;
      if (when === "upcoming") whenOk = !!t.due && t.due > todayStr && !t.completed;
      return q && tagOk && whenOk;
    });

    // Sort
    const sortMode = sortBy.value;
    if (sortMode === "manual") {
      filtered.sort((a,b) => (a.position || 0) - (b.position || 0));
    } else {
      const cmp = {
        "priority": (a,b) => priScore(b.priority) - priScore(a.priority) || byDue(a,b) || byCreated(a,b),
        "due": byDue,
        "created": byCreated,
        "title": (a,b) => a.title.localeCompare(b.title)
      }[sortMode] || byCreated;
      filtered.sort(cmp);
    }

    // Build tag filter
    const tags = Array.from(new Set(all.flatMap(t => Array.isArray(t.tags) ? t.tags : []))).sort((a,b)=>a.localeCompare(b));
    filterTag.innerHTML = '<option value="">All tags</option>' + tags.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (tag && !tags.includes(tag)) filterTag.value = "";

    // Render list
    listEl.innerHTML = "";
    filtered.forEach(t => listEl.appendChild(renderItem(t, sortMode === "manual")));
    emptyState.style.display = filtered.length ? "none" : "block";
  }

  function renderItem(t, allowDrag){
    const li = document.createElement("li");
    li.className = "task";
    li.dataset.id = t.id;
    li.draggable = !!allowDrag;
    if (allowDrag) {
      li.addEventListener("dragstart", handleDragStart);
      li.addEventListener("dragover", handleDragOver);
      li.addEventListener("drop", handleDrop);
      li.addEventListener("dragend", handleDragEnd);
    }
    const todayStr = new Date().toISOString().slice(0,10);
    if (t.completed) li.classList.add("completed");
    if (t.due && t.due < todayStr && !t.completed) li.classList.add("overdue");
    if (t.due && t.due === todayStr && !t.completed) li.classList.add("due-today");

    const left = document.createElement("div");
    left.className = "left";
    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "☰";
    dragHandle.title = "Drag to reorder";
    dragHandle.style.visibility = allowDrag ? "visible" : "hidden";
    dragHandle.setAttribute("aria-hidden", allowDrag ? "false" : "true");
    left.appendChild(dragHandle);

    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!t.completed;
    cb.addEventListener("change", () => {
      const wasCompleted = t.completed;
      t.completed = cb.checked;
      t.updatedAt = Date.now();
      if (cb.checked && !wasCompleted && t.recurrence && t.due) {
        const nextDue = getNextDue(t.due, t.recurrence);
        if (nextDue) {
          const clone = normalizeTask({
            ...t,
            id: makeId(),
            completed: false,
            due: nextDue,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).map(st => ({ title: st.title, completed: false }))
          });
          clone.position = getNextPosition();
          tasks.push(clone);
        }
      }
      saveTasks();
      render();
    });
    left.appendChild(cb);

    const mid = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = t.title;
    mid.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "meta";
    const tagsEl = document.createElement("div");
    tagsEl.className = "tags";
    const tagList = Array.isArray(t.tags) ? t.tags : [];
    tagList.forEach(tag => {
      const span = document.createElement("span");
      span.className = "tag"; span.textContent = "#" + tag;
      tagsEl.appendChild(span);
    });
    meta.appendChild(tagsEl);

    if (t.due) {
      const due = document.createElement("span");
      due.className = "badge " + (t.due < todayStr && !t.completed ? "bad" : (t.due === todayStr ? "warn" : "ok"));
      due.textContent = "Due " + t.due;
      meta.appendChild(due);
    }
    const pr = document.createElement("span");
    pr.className = "badge " + (t.priority === "high" ? "bad" : t.priority === "medium" ? "warn" : "ok");
    pr.textContent = "P: " + (t.priority || "none");
    meta.appendChild(pr);

    mid.appendChild(meta);

    const subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
    if (subtasks.length) {
      const subList = document.createElement("ul");
      subList.className = "subtasks";
      subtasks.forEach(sub => {
        const subLi = document.createElement("li");
        const subId = `${t.id}-sub-${sub.id}`;
        const subCb = document.createElement("input");
        subCb.type = "checkbox";
        subCb.checked = !!sub.completed;
        subCb.id = subId;
        subCb.addEventListener("change", () => {
          sub.completed = subCb.checked;
          t.updatedAt = Date.now();
          saveTasks();
          render();
        });
        const subLabel = document.createElement("label");
        subLabel.htmlFor = subId;
        subLabel.textContent = sub.title;
        subLi.appendChild(subCb);
        subLi.appendChild(subLabel);
        subList.appendChild(subLi);
      });
      mid.appendChild(subList);
    }

    if (t.recurrence) {
      const recurrenceInfo = document.createElement("div");
      recurrenceInfo.className = "recurrence";
      recurrenceInfo.textContent = `Repeats ${formatRecurrence(t.recurrence)}`;
      mid.appendChild(recurrenceInfo);
    }

    if (t.attachment && t.attachment.data) {
      const attachment = document.createElement("div");
      attachment.className = "attachment";
      const link = document.createElement("a");
      link.href = t.attachment.data;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (t.attachment.name) link.download = t.attachment.name;
      const img = document.createElement("img");
      img.src = t.attachment.data;
      img.alt = t.attachment.name ? `Attachment: ${t.attachment.name}` : "Task attachment";
      img.loading = "lazy";
      link.appendChild(img);
      attachment.appendChild(link);
      if (t.attachment.name) {
        const caption = document.createElement("span");
        caption.className = "attachment-name";
        caption.textContent = t.attachment.name;
        attachment.appendChild(caption);
      }
      mid.appendChild(attachment);
    }

    const right = document.createElement("div");
    right.className = "actions";

    const addSubBtn = document.createElement("button");
    addSubBtn.type = "button";
    addSubBtn.textContent = "Add subtask";
    addSubBtn.className = "secondary";
    addSubBtn.addEventListener("click", () => {
      const title = prompt("Subtask title:");
      if (title == null) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      if (!Array.isArray(t.subtasks)) t.subtasks = [];
      const newSub = createSubtask(trimmed);
      if (!newSub) return;
      t.subtasks.push(newSub);
      t.updatedAt = Date.now();
      saveTasks();
      render();
    });
    right.appendChild(addSubBtn);

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditor(t));
    right.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (confirm("Delete this task?")) {
        tasks = tasks.filter(x => x.id !== t.id);
        saveTasks(); render();
      }
    });
    right.appendChild(delBtn);

    li.appendChild(left); li.appendChild(mid); li.appendChild(right);
    return li;
  }

  function handleDragStart(e){
    if (sortBy.value !== "manual") {
      e.preventDefault();
      return;
    }
    const li = e.currentTarget;
    dragTaskId = li?.dataset?.id || null;
    li?.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragTaskId || ""); } catch {}
    }
  }

  function handleDragOver(e){
    if (sortBy.value !== "manual" || !dragTaskId) return;
    e.preventDefault();
    const li = e.currentTarget;
    if (!li || li.dataset.id === dragTaskId) return;
    const draggingEl = listEl.querySelector(".task.dragging");
    if (!draggingEl) return;
    const rect = li.getBoundingClientRect();
    const offset = (e.clientY - rect.top) / rect.height;
    if (offset > 0.5) {
      listEl.insertBefore(draggingEl, li.nextSibling);
    } else {
      listEl.insertBefore(draggingEl, li);
    }
  }

  function handleDrop(e){
    if (sortBy.value !== "manual") return;
    e.preventDefault();
    const items = $$(".task", listEl);
    const order = items.map(item => item.dataset.id).filter(Boolean);
    reorderTasks(order);
    dragTaskId = null;
    listEl.querySelectorAll(".task.dragging").forEach(el => el.classList.remove("dragging"));
    saveTasks();
    render();
  }

  function handleDragEnd(e){
    e.currentTarget?.classList.remove("dragging");
    dragTaskId = null;
  }

  function reorderTasks(order){
    if (!Array.isArray(order) || !order.length) return;
    const map = new Map(tasks.map(task => [task.id, task]));
    const seen = new Set();
    const reordered = [];
    for (const id of order) {
      if (seen.has(id)) continue;
      const task = map.get(id);
      if (task) {
        reordered.push(task);
        seen.add(id);
      }
    }
    for (const task of tasks) {
      if (!seen.has(task.id)) {
        reordered.push(task);
      }
    }
    tasks = reordered;
  }

  function openEditor(t){
    const newTitle = prompt("Title:", t.title);
    if (newTitle === null) return;
    const newDue = prompt("Due date (YYYY-MM-DD or empty):", t.due || "");
    const newPriority = prompt("Priority (none|low|medium|high):", t.priority || "none");
    const newTags = prompt("Tags (comma separated):", t.tags.join(", "));
    if (newDue === null || newPriority === null || newTags === null) return;
    const newRecurrence = prompt("Recurrence (none|daily|weekly|monthly):", t.recurrence || "none");
    if (newRecurrence === null) return;
    const newSubtasks = prompt("Subtasks (one per line, prefix with [x] for completed):", formatSubtasksForPrompt(t.subtasks));
    if (newSubtasks === null) return;
    const newNotes = prompt("Notes (optional):", t.notes || "");
    if (newNotes === null) return;
    t.title = newTitle.trim() || t.title;
    t.due = (newDue||"").trim() || null;
    t.priority = (newPriority||"medium").trim().toLowerCase();
    t.tags = parseTags(newTags);
    const rec = (newRecurrence||"").trim().toLowerCase();
    t.recurrence = recurrenceValues.has(rec) ? rec : null;
    t.subtasks = parseSubtaskLines(newSubtasks, true, t.subtasks);
    t.notes = newNotes;
    t.updatedAt = Date.now();
    saveTasks(); render();
  }

  function loadTasks(){
    try{
      const raw = JSON.parse(localStorage.getItem(storeKey));
      if (!Array.isArray(raw)) return [];
      const normalized = raw.map(normalizeTask).filter(Boolean);
      normalized.sort((a,b) => (a.position || 0) - (b.position || 0));
      normalized.forEach((task, idx) => { task.position = idx + 1; });
      return normalized;
    }catch{
      return [];
    }
  }
  function saveTasks(){
    tasks = tasks.map((task, idx) => {
      const normalized = normalizeTask(task);
      if (!normalized) return null;
      if (!Number.isFinite(normalized.position)) normalized.position = idx + 1;
      return normalized;
    }).filter(Boolean);
    tasks.forEach((task, idx) => { task.position = idx + 1; });
    localStorage.setItem(storeKey, JSON.stringify(tasks));
  }

  function initPersistenceControls(){
    const footer = $(".app-footer");
    if (!footer) return;

    let storageInfo = footer.querySelector(".storage-info");
    if (!storageInfo) {
      storageInfo = document.createElement("div");
      storageInfo.className = "storage-info";
      storageInfo.setAttribute("aria-live", "polite");

      const status = document.createElement("span");
      status.id = "storageStatus";
      status.textContent = "Checking storage…";

      const button = document.createElement("button");
      button.id = "storagePersistBtn";
      button.type = "button";
      button.textContent = "Keep data on this device";

      storageInfo.append(status, button);

      const anchor = footer.querySelector("a[href]");
      if (anchor) {
        footer.insertBefore(storageInfo, anchor);
      } else {
        footer.appendChild(storageInfo);
      }
    }

    const storageStatus = storageInfo.querySelector("#storageStatus");
    const storagePersistBtn = storageInfo.querySelector("#storagePersistBtn");
    if (!storageStatus) return;

    if (!navigator.storage || !navigator.storage.persist || !navigator.storage.persisted) {
      storageStatus.textContent = "Storage persistence not supported in this browser.";
      if (storagePersistBtn) storagePersistBtn.remove();
      return;
    }

    const updateStatus = async () => {
      try {
        const persisted = await navigator.storage.persisted();
        if (persisted) {
          storageStatus.textContent = "Tasks are protected from automatic browser cleanup.";
          if (storagePersistBtn) {
            storagePersistBtn.disabled = true;
            storagePersistBtn.textContent = "Data already protected";
          }
        } else {
          storageStatus.textContent = "Tasks might be cleared if the browser needs space.";
          if (storagePersistBtn) {
            storagePersistBtn.disabled = false;
            storagePersistBtn.textContent = "Keep data on this device";
          }
        }
      } catch (err) {
        storageStatus.textContent = "Unable to verify storage persistence.";
        if (storagePersistBtn) storagePersistBtn.disabled = true;
      }
    };

    if (storagePersistBtn) {
      storagePersistBtn.addEventListener("click", async () => {
        try {
          const granted = await navigator.storage.persist();
          if (!granted) {
            alert("Your browser declined persistent storage. Try installing the app or adjusting site settings.");
          }
        } catch (err) {
          alert("Could not request persistent storage: " + err.message);
        }
        updateStatus();
      });
    }

    updateStatus();
  }

  function parseTags(text){
    return (text||"")
  function parseTags(input){
    if (Array.isArray(input)) {
      return input
        .map(x => x == null ? "" : String(x))
        .map(x => x.trim())
        .filter(Boolean)
        .map(x => x.replace(/^#/, ""));
    }
    return String(input ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.replace(/^#/, ""));
  }
  function createSubtask(title, completed=false, id){
    const text = (title ?? "").trim();
    if (!text) return null;
    const identifier = typeof id === "string" && id ? id : makeId();
    return { id: identifier, title: text, completed: !!completed };
  }
  function parseSubtaskLines(input, keepCompletion=false, current=[]){
    const existing = new Map();
    if (Array.isArray(current)) {
      current.forEach(sub => {
        if (!sub || typeof sub !== "object") return;
        const key = String(sub.title ?? "").trim().toLowerCase();
        if (!existing.has(key)) existing.set(key, []);
        existing.get(key).push(sub);
      });
    }
    return String(input ?? "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        let text = line;
        let completed = false;
        let hasIndicator = false;
        const match = line.match(/^\s*(?:-\s*)?\[(x|X| )\]\s*(.*)$/);
        if (match) {
          hasIndicator = true;
          completed = keepCompletion && match[1].toLowerCase() === "x";
          text = match[2] || "";
        }
        const key = text.trim().toLowerCase();
        let reused = null;
        const bucket = existing.get(key);
        if (bucket && bucket.length) {
          reused = bucket.shift();
        }
        const sub = createSubtask(text, hasIndicator ? completed : (keepCompletion && reused ? !!reused.completed : false), reused?.id);
        return sub;
      })
      .filter(Boolean);
  }
  function formatSubtasksForPrompt(subtasks){
    return (Array.isArray(subtasks) ? subtasks : [])
      .map(sub => `[${sub.completed ? "x" : " "}] ${sub.title}`)
      .join("\n");
  }
  function parseHashtags(title){
    return (title.match(/#([\p{L}\p{N}_-]+)/gu) || []).map(x => x.slice(1));
  }
  function priScore(p){ return p==="high"?3 : p==="medium"?2 : p==="low"?1 : 0 }
  function byDue(a,b){
    const ad = a.due || ""; const bd = b.due || "";
    if (ad && !bd) return -1; if (!ad && bd) return 1;
    return ad.localeCompare(bd) || byCreated(a,b);
  }
  function byCreated(a,b){ return (b.createdAt||0) - (a.createdAt||0) }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
  function normalizeSubtasks(value){
    if (!Array.isArray(value)) return [];
    const result = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const sub = createSubtask(entry.title ?? "", entry.completed, entry.id);
      if (sub) result.push(sub);
    }
    return result;
  }
  function formatRecurrence(value){
    if (!value) return "";
    const map = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
    return map[value] || value;
  }
  function getNextPosition(){
    return tasks.reduce((max, task) => Math.max(max, Number(task.position) || 0), 0) + 1;
  }
  function getNextDue(due, recurrence){
    if (!due || !recurrenceValues.has(recurrence)) return null;
    const base = new Date(due + "T00:00:00");
    if (Number.isNaN(base.getTime())) return null;
    if (recurrence === "daily") base.setDate(base.getDate() + 1);
    else if (recurrence === "weekly") base.setDate(base.getDate() + 7);
    else if (recurrence === "monthly") base.setMonth(base.getMonth() + 1);
    return base.toISOString().slice(0,10);
  }
  function formatICSDate(date){
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }
  function escapeICS(value){
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  function buildICS(taskList){
    const now = formatICSDate(new Date());
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Todo Breeze//EN"
    ];
    const source = Array.isArray(taskList) ? taskList : [];
    source.forEach(raw => {
      const task = normalizeTask(raw);
      if (!task) return;
      lines.push("BEGIN:VTODO");
      lines.push("UID:" + escapeICS(task.id + "@todo-breeze"));
      lines.push("DTSTAMP:" + now);
      if (task.due) lines.push("DUE;VALUE=DATE:" + task.due.replace(/-/g, ""));
      lines.push("SUMMARY:" + escapeICS(task.title));
      if (task.notes) lines.push("DESCRIPTION:" + escapeICS(task.notes));
      if (Array.isArray(task.tags) && task.tags.length) {
        lines.push("CATEGORIES:" + task.tags.map(escapeICS).join(","));
      }
      lines.push("STATUS:" + (task.completed ? "COMPLETED" : "NEEDS-ACTION"));
      if (task.completed && task.updatedAt) {
        lines.push("COMPLETED:" + formatICSDate(new Date(task.updatedAt)));
      }
      if (task.recurrence && recurrenceValues.has(task.recurrence)) {
        lines.push("RRULE:FREQ=" + task.recurrence.toUpperCase());
      }
      lines.push("END:VTODO");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function fileToDataURL(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("Unsupported file result"));
      };
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  function makeId(){
    return String(Date.now()) + "-" + Math.random().toString(36).slice(2,8);
  }

  function normalizeTask(raw){
    if (!raw || typeof raw !== "object") return null;
    const now = Date.now();
    const priority = typeof raw.priority === "string" ? raw.priority.toLowerCase().trim() : raw.priority;
    const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Number(raw.createdAt);
    const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : Number(raw.updatedAt);
    const normalized = {
      id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
      title: typeof raw.title === "string" ? raw.title.trim() : "",
      notes: typeof raw.notes === "string" ? raw.notes : "",
      due: raw.due ? String(raw.due).slice(0,10) : null,
      priority: ["high","medium","low","none"].includes(priority) ? priority : "none",
      tags: parseTags(raw.tags),
      completed: !!raw.completed,
      createdAt: Number.isFinite(createdAt) ? createdAt : now,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : now
    };
    if (!normalized.title) normalized.title = "Untitled task";
    normalized.tags = Array.from(new Set(normalized.tags));
    if (normalized.due && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.due)) {
      normalized.due = null;
    }
    normalized.subtasks = normalizeSubtasks(raw.subtasks);
    const recurrence = typeof raw.recurrence === "string" ? raw.recurrence.trim().toLowerCase() : "";
    normalized.recurrence = recurrenceValues.has(recurrence) ? recurrence : null;
    const position = Number(raw.position);
    normalized.position = Number.isFinite(position) ? position : null;

    const attachment = raw.attachment;
    if (attachment && typeof attachment === "object" && typeof attachment.data === "string") {
      normalized.attachment = {
        name: typeof attachment.name === "string" ? attachment.name : "",
        type: typeof attachment.type === "string" ? attachment.type : "",
        size: typeof attachment.size === "number" ? attachment.size : 0,
        data: attachment.data
      };
      if (!normalized.attachment.name) delete normalized.attachment.name;
      if (!normalized.attachment.type) delete normalized.attachment.type;
      if (!normalized.attachment.size) delete normalized.attachment.size;
    }
    return normalized;
  }

  // Initial render
  render();
})();
