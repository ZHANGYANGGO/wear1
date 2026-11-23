export async function downloadBody(viewer, id) {
  const blob = await viewer.exportModel();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'wearmate-' + id + '.glb';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

