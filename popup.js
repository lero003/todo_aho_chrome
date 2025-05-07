/* popup.js – Persona Edition 1.3.4 (モーダル表示修正、レイアウト案1) */

let tasks = { todo: [], doing: [], done: [] };
let currentEditStatusContext = 'todo'; // モーダルを開くときのカラムコンテキスト
let editingTaskId = null; // 現在編集中のタスクID
let drake = null; // Dragulaのインスタンス

/***** 初期化処理 *****/
document.addEventListener('DOMContentLoaded', () => {
  loadTasks(); // タスクを読み込んで表示

  // 「追加」ボタンのイベントリスナー
  document.querySelectorAll('.add-task').forEach(btn => {
    btn.addEventListener('click', () => {
      currentEditStatusContext = btn.dataset.status; // どのカラムの「追加」か記憶
      editingTaskId = null; // 新規追加モード
      openModal(); // モーダルを開く
    });
  });

  // モーダル内のフォーム送信イベント
  document.getElementById('task-form').addEventListener('submit', saveFromModal);
  // モーダル内のキャンセルボタン
  document.querySelector('#task-form .cancel').addEventListener('click', closeModal);
  // モーダルの背景クリックで閉じる
  document.getElementById('task-modal').addEventListener('click', e => {
    if (e.target.id === 'task-modal') closeModal();
  });
});

/***** Dragula ドラッグ＆ドロップ設定 *****/
function initializeDragAndDrop() {
    if (drake) drake.destroy(); // 既存のインスタンスがあれば破棄

    const containers = Array.from(document.querySelectorAll('.task-list'));
    drake = dragula(containers, {
        moves: function (el, source, handle, sibling) {
            // task-main-infoクラスを持つ要素(またはその子要素)がドラッグハンドル
            return handle.closest('.task-main-info') !== null;
        }
    });

    drake.on('drop', (el, targetList, sourceList, sibling) => {
        const taskId = el.dataset.id;
        const newStatus = targetList.id.replace('-list', '');
        const oldStatus = sourceList.id.replace('-list', '');

        let droppedTask = null;
        // tasksデータモデルからタスクを移動
        if (tasks[oldStatus]) {
            const taskIndex = tasks[oldStatus].findIndex(t => t.id.toString() === taskId);
            if (taskIndex !== -1) {
                droppedTask = tasks[oldStatus].splice(taskIndex, 1)[0];
            }
        }

        if (droppedTask) {
            droppedTask.status = newStatus; // タスクのステータスを更新
            if (!tasks[newStatus]) tasks[newStatus] = []; // 新しいカラムがなければ初期化

            // ドロップされた位置にタスクを挿入
            const siblingId = sibling ? sibling.dataset.id : null;
            let newIndex = tasks[newStatus].length; // デフォルトは末尾
            if (siblingId) {
                const siblingIndexInJsModel = tasks[newStatus].findIndex(t => t.id.toString() === siblingId);
                if (siblingIndexInJsModel !== -1) {
                    newIndex = siblingIndexInJsModel;
                }
            }
            tasks[newStatus].splice(newIndex, 0, droppedTask);
            saveTasksAndUpdateAlarms(renderTasks); // 保存してUI再描画、アラームも更新
        } else {
             // データモデルに見つからない場合(予期せぬエラー)、UIを元に戻すために再描画
             renderTasks();
        }
    });
}

/***** データ保存・読み込みヘルパー *****/
function loadTasks() {
  chrome.storage.local.get("tasks", res => {
    tasks.todo = res.tasks?.todo || [];
    tasks.doing = res.tasks?.doing || [];
    tasks.done = res.tasks?.done || [];
    renderTasks(); // タスク読み込み後にUIを描画
  });
}

function saveTasksAndUpdateAlarms(callback) {
  chrome.storage.local.set({ tasks }, () => {
    // 全タスクのアラームを更新 (background.jsへメッセージ送信)
    const allUserTasks = [].concat(...Object.values(tasks).filter(Array.isArray));
    allUserTasks.forEach(task => {
      if (chrome.runtime && chrome.runtime.sendMessage) {
          const taskForAlarm = { ...task };
          delete taskForAlarm.time; // 時刻情報は使用しない
          chrome.runtime.sendMessage({ action: "manageTaskAlarm", task: taskForAlarm }, response => {
              if (chrome.runtime.lastError) {
                  // console.warn(`Alarm message error for task ${task.id}: ${chrome.runtime.lastError.message}`);
              }
          });
      }
    });
    if (callback) callback(); // 保存後のコールバック実行 (通常はrenderTasks)
  });
}

/***** タスク操作 (CRUD) *****/
function findTaskById(id) {
    for (const statusKey in tasks) {
        if (Array.isArray(tasks[statusKey])) {
            const task = tasks[statusKey].find(t => t.id.toString() === id.toString());
            if (task) return { task, statusKey };
        }
    }
    return null;
}

function deleteTask(id) {
  const taskInfo = findTaskById(id);
  if (taskInfo) {
    const { task, statusKey } = taskInfo;
    tasks[statusKey] = tasks[statusKey].filter(t => t.id !== task.id);
    // 削除されたタスクのアラームも解除するようbackground.jsに通知
    if (chrome.runtime && chrome.runtime.sendMessage) {
        const taskForAlarm = { ...task, status: 'deleted' }; // status: 'deleted'で削除を伝える
        delete taskForAlarm.time;
        chrome.runtime.sendMessage({ action: "manageTaskAlarm", task: taskForAlarm });
    }
    saveTasksAndUpdateAlarms(renderTasks);
  }
}

/***** モーダル表示制御 *****/
function openModal() {
  const modalEl = document.getElementById('task-modal');
  const modalTitleEl = document.getElementById('modal-title');
  const taskIdField = document.getElementById('task-id-edit'); // 編集用ID（隠しフィールド）
  const titleField = document.getElementById('task-title');
  const dateField = document.getElementById('task-date');
  const descField = document.getElementById('task-desc');

  if (editingTaskId) { // 編集モードの場合
    modalTitleEl.textContent = 'タスクを編集';
    const taskInfo = findTaskById(editingTaskId);
    if (taskInfo) {
        const task = taskInfo.task;
        taskIdField.value = task.id;
        titleField.value = task.title;
        dateField.value = task.due || '';
        descField.value = task.desc || '';
        currentEditStatusContext = task.status; // 編集中のタスクの現在のステータスを保持
    }
  } else { // 新規追加モードの場合
    modalTitleEl.textContent = 'タスクを追加';
    taskIdField.value = ''; // 編集IDは空
    titleField.value = '';
    dateField.value = '';
    descField.value = '';
    // currentEditStatusContext は「追加」ボタンクリック時に設定済み
  }
  modalEl.classList.remove('hidden'); // モーダル表示
  titleField.focus(); // タイトル入力欄にフォーカス
}

function closeModal() {
  const modalEl = document.getElementById('task-modal');
  modalEl.classList.add('hidden'); // モーダル非表示
  editingTaskId = null; // 編集モード解除
}

// モーダルからタスクを保存 (新規追加 or 編集)
function saveFromModal(e) {
  e.preventDefault(); // フォームのデフォルト送信をキャンセル
  const title = document.getElementById('task-title').value.trim();
  if (!title) {
    alert("タイトルは必須です。");
    return;
  }

  const idValue = document.getElementById('task-id-edit').value;
  const taskData = {
    id: idValue ? parseInt(idValue) : Date.now(), // 編集時は既存ID、新規は現在時刻でID生成
    title: title,
    due: document.getElementById('task-date').value,
    desc: document.getElementById('task-desc').value.trim(),
    status: currentEditStatusContext // 新規追加時・編集中に保持していたステータス
  };
  // taskData.time はもう存在しないはずだが念のため
  delete taskData.time;

  if (idValue) { // IDがあれば編集
    const taskInfo = findTaskById(taskData.id);
    if (taskInfo) {
        // ステータスが変更される可能性も考慮 (今回はモーダルでステータス変更UIはないが将来的にはありうる)
        // もし currentEditStatusContext が元のステータスと異なれば、リスト間移動も必要
        // 今回は taskData.status をそのまま使うので、同じリスト内で更新される
        Object.assign(taskInfo.task, taskData);
    }
  } else { // IDがなければ新規追加
    if (!tasks[taskData.status]) tasks[taskData.status] = [];
    tasks[taskData.status].push(taskData);
  }

  saveTasksAndUpdateAlarms(() => { // 保存して、UI再描画とアラーム更新
      renderTasks();
      closeModal();
  });
}

/***** UI描画 *****/
function renderTasks() {
  // 各タスクリストをクリア
  document.querySelectorAll('.task-list').forEach(l => (l.innerHTML = ''));
  const allUserTasks = []; // アラーム設定用に全タスクを一時保存

  ['todo', 'doing', 'done'].forEach(statusKey => {
    if (Array.isArray(tasks[statusKey])) {
      tasks[statusKey].forEach(task => {
        addTaskToUI(task); // 個々のタスクをDOMに追加
        allUserTasks.push(task);
      });
    }
  });

  initializeDragAndDrop(); // Dragulaを再初期化 (DOM要素が再生成されるため)

  // 全タスクのアラームを更新 (background.jsへメッセージ送信)
  allUserTasks.forEach(task => {
    if (chrome.runtime && chrome.runtime.sendMessage) {
        const taskForAlarm = { ...task };
        delete taskForAlarm.time;
        chrome.runtime.sendMessage({ action: "manageTaskAlarm", task: taskForAlarm }, response => {
            if (chrome.runtime.lastError) {
                // console.warn(`Alarm message error during render for task ${task.id}: ${chrome.runtime.lastError.message}`);
            }
        });
    }
  });
}

// 個々のタスク要素を生成してDOMに追加
function addTaskToUI(task) {
  const listEl = document.getElementById(task.status + '-list');
  if (!listEl) return; // 対応するリストがなければ何もしない

  const taskEl = document.createElement('div');
  taskEl.className = 'task';
  taskEl.dataset.id = task.id; // ドラッグ＆ドロップや編集でタスクを特定するため

  // 期限日によるクラス付与 (CSSで見た目を変更)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (task.due) {
    const dueDate = new Date(task.due); dueDate.setHours(0,0,0,0); // 時刻部分を正規化
    if (dueDate < today) taskEl.classList.add('due-overdue');
    else if (dueDate.getTime() === today.getTime()) taskEl.classList.add('due-today');
    else if ((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24) <= 3) { // 3日以内なら "due-soon"
        taskEl.classList.add('due-soon');
    }
  }

  // --- レイアウト案1 対応 ---
  const mainInfoEl = document.createElement('div');
  mainInfoEl.className = 'task-main-info'; // タイトルとアクション行の親 (ドラッグハンドル)

  const titleSpan = document.createElement('span');
  titleSpan.className = 'task-title-display';
  titleSpan.textContent = task.title;
  mainInfoEl.appendChild(titleSpan);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'task-actions'; // 日付(左)とボタン群(右)

  if (task.due) {
    const dueDateSpan = document.createElement('span');
    dueDateSpan.className = 'task-due-date-display';
    dueDateSpan.textContent = `(${task.due})`;
    actionsDiv.appendChild(dueDateSpan);
  } else {
    // 日付がない場合にレイアウトを保つための空要素 (CSSで非表示なども可)
    const emptyDueDateSpan = document.createElement('span');
    emptyDueDateSpan.className = 'task-due-date-display'; // スタイルを合わせる
    emptyDueDateSpan.innerHTML = '&nbsp;'; // 空白を入れて高さを確保する場合
    actionsDiv.appendChild(emptyDueDateSpan);
  }

  const buttonsWrapper = document.createElement('div');
  buttonsWrapper.className = 'buttons-wrapper';

  const editBtn = document.createElement('button');
  editBtn.innerHTML = '&#x270E;'; // ✎
  editBtn.className = 'edit-task-btn';
  editBtn.title = '編集';
  editBtn.addEventListener('click', e => {
    e.stopPropagation(); // 親要素へのイベント伝播を停止
    editingTaskId = task.id;
    openModal();
  });
  buttonsWrapper.appendChild(editBtn);

  const delBtn = document.createElement('button');
  delBtn.innerHTML = '&times;'; // ×
  delBtn.className = 'delete-task';
  delBtn.title = '削除';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`「${task.title}」を削除してもよろしいですか？`)) deleteTask(task.id);
  });
  buttonsWrapper.appendChild(delBtn);
  actionsDiv.appendChild(buttonsWrapper);
  mainInfoEl.appendChild(actionsDiv);
  taskEl.appendChild(mainInfoEl);
  // --- レイアウト案1 対応ここまで ---

  // 詳細表示トグル (Doneタスク以外)
  if (task.status !== 'done') {
    const detailsToggle = document.createElement('div');
    detailsToggle.className = 'task-details-toggle';
    detailsToggle.textContent = '詳細を表示/非表示';
    detailsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        taskEl.classList.toggle('expanded');
    });
    taskEl.appendChild(detailsToggle);
  }

  // 詳細内容表示エリア
  const detailsContentEl = document.createElement('div');
  detailsContentEl.className = 'task-details-content';
  let detailsHTML = '';
  if (task.desc) detailsHTML += `<p>${task.desc.replace(/\n/g, '<br>')}</p>`; // 改行を<br>に変換
  else detailsHTML = '<p><em>詳細情報はありません。</em></p>';
  detailsContentEl.innerHTML = detailsHTML;
  taskEl.appendChild(detailsContentEl);

  // 完了タスク用のコンパクト表示クラス
  if (task.status === 'done') {
    taskEl.classList.add('task-done-compact');
  }

  listEl.appendChild(taskEl); // 生成したタスク要素をリストに追加
}