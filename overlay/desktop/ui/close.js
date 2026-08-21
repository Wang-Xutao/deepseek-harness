function api() {
  return window.bafDialog
}

document.getElementById('cancel').addEventListener('click', () => {
  api()?.closeChoice({ action: 'cancel', remember: false })
})

document.getElementById('ok').addEventListener('click', () => {
  const action = document.querySelector('input[name="action"]:checked')?.value ?? 'tray'
  const remember = document.getElementById('remember').checked
  api()?.closeChoice({ action, remember })
})
