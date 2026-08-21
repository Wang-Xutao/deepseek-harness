const api = window.bafShell
document.getElementById('min').addEventListener('click', () => api?.minimize())
document.getElementById('max').addEventListener('click', () => api?.maximize())
document.getElementById('close').addEventListener('click', () => api?.close())
