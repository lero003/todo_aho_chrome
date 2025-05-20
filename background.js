/* background.js - Handles alarms and notifications (時刻なしバージョン) */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("task-reminder-")) {
    const taskId = alarm.name.replace("task-reminder-", "");
    chrome.storage.local.get("tasks", (res) => {
      const allTasks = { todo: [], doing: [], done: [], ...res.tasks };
      let taskFound = null;
      for (const status in allTasks) {
        if (Array.isArray(allTasks[status])) {
            const task = allTasks[status].find(t => t.id.toString() === taskId);
            if (task) {
              taskFound = task;
              break;
            }
        }
      }

      if (taskFound && taskFound.status !== 'done') {
        chrome.notifications.create(`notify-${taskFound.id}-${Date.now()}`, {
          type: "basic",
          iconUrl: "icon_128.png",
          title: "タスクの期限です！",
          message: `「${taskFound.title}」は本日が期限です。`, // メッセージを調整
          priority: 2,
          eventTime: Date.now()
        });
      }
    });
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.action.openPopup();
});

function manageAlarm(taskId, taskDueDateStr, taskTitle, taskStatus) {
  const alarmName = `task-reminder-${taskId}`;
  chrome.storage.sync.get({ notificationTime: "09:00" }, ({ notificationTime }) => {
    if (taskStatus !== 'done' && taskDueDateStr) {
      try {
        // ユーザー設定の通知時刻を使用してアラームを設定
        const alarmDateTime = new Date(`${taskDueDateStr}T${notificationTime}:00`);

        if (alarmDateTime.getTime() > Date.now()) {
          chrome.alarms.create(alarmName, { when: alarmDateTime.getTime() });
          // console.log(`Alarm set/updated for ${taskTitle} on ${taskDueDateStr} at ${notificationTime}`);
        } else {
          chrome.alarms.clear(alarmName); // 過去の日付ならアラームは不要
          // console.log(`Alarm cleared for ${taskTitle} (past due date)`);
        }
      } catch (e) {
        console.error("Invalid date for alarm:", taskDueDateStr, e);
        chrome.alarms.clear(alarmName);
      }
    } else {
      chrome.alarms.clear(alarmName);
      // console.log(`Alarm cleared for ${taskTitle} (no due date or done)`);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manageTaskAlarm") {
    if (request.task && request.task.id !== undefined) { // task.idが存在することを確認
        // task.time はもう使わないので、task.due (日付文字列) のみを渡す
        manageAlarm(request.task.id, request.task.due, request.task.title, request.task.status);
        sendResponse({ status: "Alarm processed for task " + request.task.id });
    } else {
        sendResponse({ status: "No action taken for alarm, invalid task data."});
    }
    return true;
  }
});