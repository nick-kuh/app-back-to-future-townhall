/* Formulário "De Volta para o Sucesso" (QR do painel 3D): usa o nome do check-in do app.
 * Este script entra antes do script do formulário (o arquivo original não muda): grava o nome e a
 * identidade da pessoa onde o formulário já procura, esconde o campo de nome e, se a pessoa ainda
 * não fez check-in, manda para o app e volta para cá depois. */
(() => {
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  const token = get('bttf.token'), name = get('bttf.name'), pid = Number(get('bttf.pid'));
  const login = () => location.replace('/?next=' + encodeURIComponent(location.pathname + location.search));
  if (!token || !name || !pid) return login();
  set('townhall.name', name.slice(0, 80));
  set('townhall.participantId', 'b77f0000-0000-4000-8000-' + pid.toString(16).padStart(12, '0'));
  const style = document.createElement('style');
  style.textContent = 'label[for=participantName],#participantName{display:none!important}.login-as{margin:0 0 14px;font-size:14px;color:#bcb5da}.login-as b{color:#f3f0ff}';
  document.head.appendChild(style);
  addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('responseForm'); if (!form) return;
    const p = document.createElement('p'); p.className = 'login-as'; p.append('Respondendo como ');
    const b = document.createElement('b'); b.textContent = name; p.append(b); form.prepend(p);
  });
  // check-in desfeito ou evento reiniciado: volta para o login do app
  fetch('/api/me?token=' + encodeURIComponent(token), { cache: 'no-store' }).then(r => r.json()).then(d => {
    if (!d || !d.ok) return login();
    if (d.me.person.name !== name) { set('bttf.name', d.me.person.name); location.reload(); }
  }).catch(() => { /* sem rede: segue com o nome guardado */ });
})();
