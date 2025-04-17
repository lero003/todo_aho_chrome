/* popup.js – Persona Edition 1.2 (期限・詳細対応 + モーダル fix) */

let tasks = { todo: [], doing: [], done: [] };
let currentStatus = 'todo';

/***** init *****/
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();

  // open modal
  document.querySelectorAll('.add-task').forEach(btn => {
    btn.addEventListener('click', () => {
      currentStatus = btn.dataset.status;
      openModal();
    });
  });

  // column drop targets
  document.querySelectorAll('.task-list').forEach(list => {
    list.addEventListener('dragover', e => e.preventDefault());
    list.addEventListener('drop', e => {
      e.preventDefault();
      moveTaskAcrossColumns(
        e.dataTransfer.getData('text/plain'),
        list.id.replace('-list', ''),
        null, false
      );
    });
  });

  // modal events
  document.getElementById('task-form').addEventListener('submit', saveFromModal);
  document.querySelector('#task-form .cancel').addEventListener('click', closeModal);
  document.getElementById('task-modal').addEventListener('click', e => {
    if (e.target.id === 'task-modal') closeModal();
  });
});

/***** storage helpers *****/
function loadTasks() {
  chrome.storage?.local.get("tasks", res => {
    const def = { todo: [], doing: [], done: [] };
    tasks = res?.tasks ? Object.assign(def, res.tasks) : def;
    renderTasks();
  });
}
function saveTasks(cb) {
  chrome.storage?.local.set({ tasks }, () => cb && cb());
}

/***** CRUD *****/
function addNewTask(status, title, due = '', desc = '') {
  if (!tasks[status]) tasks[status] = [];
  tasks[status].push({ id: Date.now(), title, due, desc, status });
  saveTasks(renderTasks);
}
function deleteTask(id) {
  ['todo', 'doing', 'done'].forEach(s => {
    const i = tasks[s].findIndex(t => t.id == id);
    if (i !== -1) tasks[s].splice(i, 1);
  });
  saveTasks(renderTasks);
}

/***** modal helpers *****/
function openModal() {
  document.getElementById('task-title').value = '';
  document.getElementById('task-date').value = '';
  document.getElementById('task-desc').value = '';
  document.getElementById('task-modal').classList.remove('hidden');
  document.getElementById('task-title').focus();
}
function closeModal() {
  document.getElementById('task-modal').classList.add('hidden');
}
function saveFromModal(e) {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  if (!title) return;
  addNewTask(
    currentStatus,
    title,
    document.getElementById('task-date').value,
    document.getElementById('task-desc').value.trim()
  );
  closeModal();
}

/***** UI rendering *****/
function renderTasks() {
  document.querySelectorAll('.task-list').forEach(l => (l.innerHTML = ''));
  ['todo', 'doing', 'done'].forEach(s => tasks[s].forEach(t => addTaskToUI(t)));
}
function addTaskToUI(t) {
  const list = document.getElementById(t.status + '-list');
  if (!list) return;

  const el = document.createElement('div');
  el.className = 'task';
  el.draggable = true;
  el.dataset.id = t.id;

  // title + due line
  const span = document.createElement('span');
  span.innerHTML = t.title + (t.due ? ` <small style="font-weight:400;color:#666">(${t.due})</small>` : '');
  el.appendChild(span);

  // delete btn
  const del = document.createElement('button');
  del.textContent = '×';
  del.className = 'delete-task';
  del.title = '削除';
  del.addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`「${t.title}」を削除しますか？`)) deleteTask(t.id);
  });
  el.appendChild(del);

  // drag meta
  el.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.setData('source-status', t.status);
  });

  // click to open detail alert
  el.addEventListener('click', () => {
    alert(`${t.title}\n${t.due ? '期限: ' + t.due + '\n' : ''}${t.desc || ''}`);
  });

  list.appendChild(el);
}

/***** drag helpers (unchanged) *****/
function reorderTask(dragId, targetId, above) {
  ['todo', 'doing', 'done'].forEach(s => {
    const i1 = tasks[s].findIndex(t => t.id == dragId);
    const i2 = tasks[s].findIndex(t => t.id == targetId);
    if (i1 !== -1 && i2 !== -1 && i1 !== i2) {
      const [drag] = tasks[s].splice(i1, 1);
      const newIdx = above ? i2 : i2 + 1;
      tasks[s].splice(newIdx, 0, drag);
      saveTasks(renderTasks);
    }
  });
}
function moveTaskAcrossColumns(dragId, newStatus, targetId, before) {
  let drag = null;
  ['todo', 'doing', 'done'].forEach(s => {
    const i = tasks[s].findIndex(t => t.id == dragId);
    if (i !== -1) drag = tasks[s].splice(i, 1)[0];
  });
  if (!drag) return;
  drag.status = newStatus;
  if (!tasks[newStatus]) tasks[newStatus] = [];
  if (targetId) {
    const idx = tasks[newStatus].findIndex(t => t.id == targetId);
    const insert = idx === -1 ? tasks[newStatus].length : before ? idx : idx + 1;
    tasks[newStatus].splice(insert, 0, drag);
  } else {
    tasks[newStatus].push(drag);
  }
  saveTasks(renderTasks);
}