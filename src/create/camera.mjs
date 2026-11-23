export function installCamera(inputs) {
  const dialog = document.querySelector('#camera-dialog');
  const video = dialog.querySelector('video');
  const status = document.querySelector('#camera-status');
  const shoot = document.querySelector('#shoot');
  let stream, target, revision = 0;
  function stop() {
    revision++;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    if (dialog.open) dialog.close();
  }
  for (const input of inputs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'create-action camera-button';
    button.dataset.camera = input.dataset.view;
    button.textContent = '用摄像头拍摄';
    input.after(button);
    button.addEventListener('click', async event => {
      event.preventDefault();
      const current = ++revision;
      target = input;
      document.querySelector('#camera-label').textContent = '拍摄' + (input.closest('.upload-box').querySelector('strong,label')?.textContent || '参考照');
      status.textContent = '请允许浏览器使用摄像头。';
      shoot.disabled = true;
      dialog.showModal();
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (current !== revision) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        video.srcObject = stream;
        await video.play();
        if (current !== revision) return;
        status.textContent = '调整站位后点击拍摄。';
        shoot.disabled = false;
      } catch {
        if (current === revision) {
          stream?.getTracks().forEach(track => track.stop());
          video.srcObject = null;
          status.textContent = '摄像头不可用，请检查浏览器权限或关闭此窗口上传照片。';
        }
      }
    });
  }
  shoot.addEventListener('click', async () => {
    if (!video.videoWidth || !stream) return;
    const current = revision;
    shoot.disabled = true;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
    if (revision !== current) return;
    if (!blob) { status.textContent = '采集失败，请重拍。'; shoot.disabled = false; return; }
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], target.dataset.view + '.jpg', { type: blob.type }));
    target.files = transfer.files;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    stop();
  });
  document.querySelector('#close-camera').addEventListener('click', stop);
  dialog.addEventListener('cancel', event => { event.preventDefault(); stop(); });
  window.addEventListener('pagehide', stop);
}

