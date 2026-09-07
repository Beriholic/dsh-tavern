// The pre-game iframe can select a card greeting, but cannot write Session history.
function installOpeningPreviewBridge(token, preview) {
  const swipes = preview.swipes.slice();
  let selected = preview.selectedIndex;
  let nextId = 0;
  const pending = new Map();
  window.getCurrentMessageId = window.getLastMessageId = function () { return 0; };
  window.getChatMessages = function (id, options) {
    if (Number(id) !== 0 || (options && options.role && !['all', 'assistant'].includes(options.role))) return [];
    return [{ message_id: 0, role: 'assistant', message: swipes[selected], swipe_id: selected, swipes: swipes.slice() }];
  };
  // Some chooser pages await this gate without reading MVU. No game state exists yet.
  window.waitGlobalInitialized = async function (name) {
    if (name === 'Mvu') return undefined;
    throw new Error('开场预览尚未初始化 ' + name);
  };
  window.errorCatched = function (callback) {
    return function () { return Promise.resolve().then(() => callback.apply(this, arguments)).catch(console.error); };
  };
  window.setChatMessages = async function (patches) {
    if (!Array.isArray(patches) || patches.length !== 1) throw new Error('开场预览只能选择一条开场');
    const patch = patches[0];
    const index = Number(patch && patch.swipe_id);
    if (!patch || Number(patch.message_id) !== 0 || !Number.isInteger(index) || !preview.openingIds[index] ||
        Object.keys(patch).some(key => !['message_id', 'swipe_id', 'message'].includes(key)) ||
        (patch.message !== undefined && patch.message !== swipes[index])) {
      throw new Error('开场预览只支持选择人物卡已有开场，不能修改正文或变量');
    }
    const requestId = String(++nextId);
    await new Promise(function (resolve, reject) {
      const timer = setTimeout(function () { pending.delete(requestId); reject(new Error('开场选择超时，请使用开场切换按钮')); }, 10000);
      pending.set(requestId, { resolve, reject, timer });
      parent.postMessage({ type: 'dsh-tavern-opening-select', token, requestId, swipeId: index }, '*');
    });
    selected = index;
  };
  window.setChatMessage = function (message, messageId, options) {
    return window.setChatMessages([{ message_id: messageId, message, swipe_id: options && options.swipe_id }]);
  };
  addEventListener('message', function (event) {
    const data = event.data;
    if (event.source !== parent || !data || data.token !== token || data.type !== 'dsh-tavern-opening-response') return;
    const task = pending.get(data.requestId);
    if (!task) return;
    pending.delete(data.requestId); clearTimeout(task.timer);
    if (data.ok) task.resolve(); else task.reject(new Error(data.error || '开场选择失败'));
  });
}

function openingPreviewSelection(preview, swipeId) {
  if (!preview || !Number.isInteger(swipeId) || swipeId < 0 || !preview.openingIds[swipeId]) throw new Error('人物卡开场白不存在');
  return preview.openingIds[swipeId];
}
