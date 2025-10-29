/* Todo Breeze - no backend, localStorage-only PWA */
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  const storeKey = "tb.tasks.v1";
  const themeKey = "tb.theme";
  let tasks = loadTasks();

  const addForm = $("#addForm");
  const titleInput = $("#titleInput");
  const dueInput = $("#dueInput");
  const priorityInput = $("#priorityInput");
  const tagsInput = $("#tagsInput");
  const listEl = $("#taskList");
  const emptyState = $("#emptyState");

  const searchInput = $("#searchInput");
  const filterTag = $("#filterTag");
  const filterWhen = $("#filterWhen");
  const sortBy = $("#sortBy");

  const exportBtn = $("#exportBtn");
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

  // Add task
  addForm.addEventListener("submit", e => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if(!title) return;
    const due = dueInput.value || null;
    const priority = priorityInput.value;
    const extraTags = parseTags(tagsInput.value);
    const titleTags = parseHashtags(title);
    const allTags = Array.from(new Set([...titleTags, ...extraTags]));

    const now = Date.now();
    tasks.push({
      id: String(now) + "-" + Math.random().toString(36).slice(2,8),
      title, notes: "", due, priority, tags: allTags, completed: false,
      createdAt: now, updatedAt: now
    });
    saveTasks();
    addForm.reset();
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
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if(!Array.isArray(imported)) throw new Error("Invalid file format");
      const existing = new Map(tasks.map(t => [t.id, t]));
      for(const t of imported){
        if(!t.id) t.id = String(Date.now()) + "-" + Math.random().toString(36).slice(2,8);
        existing.set(t.id, {...existing.get(t.id), ...t, updatedAt: Date.now()});
      }
      tasks = Array.from(existing.values());
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
        tasks = sample.map(t => ({...t, id: t.id || String(Date.now()) + Math.random().toString(36).slice(2,8)}));
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
    const all = tasks.slice();
    const query = (searchInput.value || "").toLowerCase().trim();
    const tag = (filterTag.value || "").trim();
    const when = filterWhen.value;

    let filtered = all.filter(t => {
      const q = !query || (t.title.toLowerCase().includes(query) || (t.notes||"").toLowerCase().includes(query) || t.tags.some(x => x.toLowerCase().includes(query)));
      const tagOk = !tag || t.tags.includes(tag);
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
    const cmp = {
      "priority": (a,b) => priScore(b.priority) - priScore(a.priority) || byDue(a,b) || byCreated(a,b),
      "due": byDue,
      "created": byCreated,
      "title": (a,b) => a.title.localeCompare(b.title)
    }[sortBy.value] || byCreated;
    filtered.sort(cmp);

    // Build tag filter
    const tags = Array.from(new Set(all.flatMap(t => t.tags))).sort((a,b)=>a.localeCompare(b));
    filterTag.innerHTML = '<option value="">All tags</option>' + tags.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (tag && !tags.includes(tag)) filterTag.value = "";

    // Render list
    listEl.innerHTML = "";
    filtered.forEach(t => listEl.appendChild(renderItem(t)));
    emptyState.style.display = filtered.length ? "none" : "block";
  }

  function renderItem(t){
    const li = document.createElement("li");
    li.className = "task";
    const todayStr = new Date().toISOString().slice(0,10);
    if (t.completed) li.classList.add("completed");
    if (t.due && t.due < todayStr && !t.completed) li.classList.add("overdue");
    if (t.due && t.due === todayStr && !t.completed) li.classList.add("due-today");

    const left = document.createElement("div");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!t.completed;
    cb.addEventListener("change", () => { t.completed = cb.checked; t.updatedAt = Date.now(); saveTasks(); render(); });
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
    t.tags.forEach(tag => {
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

    const right = document.createElement("div");
    right.className = "actions";

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

  function openEditor(t){
    const newTitle = prompt("Title:", t.title);
    if (newTitle === null) return;
    const newDue = prompt("Due date (YYYY-MM-DD or empty):", t.due || "");
    const newPriority = prompt("Priority (none|low|medium|high):", t.priority || "none");
    const newTags = prompt("Tags (comma separated):", t.tags.join(", "));
    t.title = newTitle.trim() || t.title;
    t.due = (newDue||"").trim() || null;
    t.priority = (newPriority||"medium").trim().toLowerCase();
    t.tags = parseTags(newTags);
    t.updatedAt = Date.now();
    saveTasks(); render();
  }

  function loadTasks(){
    try{
      return JSON.parse(localStorage.getItem(storeKey)) || [];
    }catch{ return []; }
  }
  function saveTasks(){
    localStorage.setItem(storeKey, JSON.stringify(tasks));
  }

  function parseTags(text){
    return (text||"")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.replace(/^#/, ""));
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

  // Initial render
  render();
})();