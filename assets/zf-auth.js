/* ZenFisio — login seguro no navegador (v1)
   - A senha nunca fica escrita nas páginas: o login é conferido pelo Apps Script.
   - A "sessão" fica só na aba do navegador (sessionStorage) e some ao fechar a aba.
   - "Esqueci a senha": o código de 6 dígitos vai para o e-mail do RH. */
(function () {
  var K = function (url) { return 'zf_sessao_' + url.slice(-24); };
  var enc = encodeURIComponent;

  function lerSessao(url) {
    try { return JSON.parse(sessionStorage.getItem(K(url)) || 'null'); } catch (e) { return null; }
  }

  var ZFAuth = {
    // "Acorda" o script do Google (o primeiro acesso do dia demora alguns segundos)
    aquecer: function (url) {
      try { fetch(url + '?acao=ping', { mode: 'no-cors' }).catch(function () {}); } catch (e) {}
    },
    // Entra. Retorna o JSON do servidor ({ok, usuario, nome, perfil, sessao} ou {ok:false, erro})
    login: async function (url, user, pass) {
      // Mostra "Entrando..." no botão clicado e evita clique duplo
      var btn = document.activeElement, texto = '';
      var temBtn = btn && btn.tagName === 'BUTTON' && !btn.disabled;
      if (temBtn) { texto = btn.textContent; btn.textContent = 'Entrando...'; btn.disabled = true; }
      try {
        var r = await fetch(url + '?acao=login&user=' + enc(user) + '&pass=' + enc(pass));
        var d = await r.json();
        if (d && d.ok && d.sessao) {
          try { sessionStorage.setItem(K(url), JSON.stringify({ sessao: d.sessao, nome: d.nome, perfil: d.perfil, usuario: d.usuario })); } catch (e) {}
        }
        return d;
      } finally {
        if (temBtn) { btn.textContent = texto; btn.disabled = false; }
      }
    },
    dados: function (url) { return lerSessao(url); },
    sessao: function (url) { var s = lerSessao(url); return s ? s.sessao : ''; },
    sair: function (url) { try { sessionStorage.removeItem(K(url)); } catch (e) {} },
    // URL de consulta (GET) já com a sessão: ZFAuth.urlGet(url, {acao:'listar'})
    urlGet: function (url, params) {
      var q = []; params = params || {};
      Object.keys(params).forEach(function (k) { q.push(enc(k) + '=' + enc(params[k])); });
      q.push('sessao=' + enc(ZFAuth.sessao(url)));
      return url + '?' + q.join('&');
    },
    // Acrescenta a sessão ao corpo de um POST
    comSessao: function (url, corpo) { corpo = corpo || {}; corpo.sessao = ZFAuth.sessao(url); return corpo; },
    // Se o servidor respondeu "Acesso negado", a sessão expirou: volta para o login
    negado: function (json) { return !!(json && json.semAcesso); },

    // Endereço padrão usado pelo "Esqueci a senha" (script do Calendário, que tem e-mail e planilha de acessos)
    urlEsqueci: 'https://script.google.com/macros/s/AKfycbyzI5AplyuA2-mc8G8S2zCiC1yj-g60zCJ30YdS8S4IlyXNz_Rg_fuqXmkMnLN_5jcbhQ/exec',

    // Sessão expirou: limpa e recarrega a página (volta para a tela de login)
    expirou: function (url) { ZFAuth.sair(url); alert('Sua sessão expirou. Entre novamente.'); location.reload(); },

    // Tela de login em tela cheia para páginas que não têm uma.
    // opts: { perfis: ['rh'], titulo: 'Texto', aoEntrar: function (dados) {} }
    exigirLogin: function (url, opts) {
      opts = opts || {};
      var perfis = opts.perfis || ['rh'];
      var s = lerSessao(url);
      if (s && s.sessao && perfis.indexOf(s.perfil) >= 0) { if (opts.aoEntrar) opts.aoEntrar(s); return; }
      ZFAuth.aquecer(url);
      var estilo = 'font-family:inherit;font-size:14px;';
      var ov = document.createElement('div');
      ov.id = 'zf-login-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#F2F4F0;display:flex;align-items:center;justify-content:center;padding:1.5rem;' + estilo;
      ov.innerHTML =
        '<div style="background:#fff;border:1px solid #DDE0D8;border-radius:14px;padding:32px 28px;width:100%;max-width:360px;box-sizing:border-box;">' +
        '<a href="../index.html" style="display:inline-block;margin-bottom:14px;color:#4A7C59;font-size:13px;font-weight:600;text-decoration:none;">&larr; Início</a>' +
        '<div style="font-weight:700;font-size:18px;color:#2D5438;margin-bottom:4px;">' + (opts.titulo || 'Acesso restrito') + '</div>' +
        '<div style="color:#9AA394;font-size:13px;margin-bottom:18px;">ZenFisio · Gestão de Pessoas</div>' +
        '<input id="zf-l-user" type="text" placeholder="usuário" autocomplete="username" style="width:100%;padding:10px 12px;border:1px solid #DDE0D8;border-radius:8px;margin-bottom:10px;box-sizing:border-box;' + estilo + '">' +
        '<input id="zf-l-pass" type="password" placeholder="senha" autocomplete="current-password" style="width:100%;padding:10px 12px;border:1px solid #DDE0D8;border-radius:8px;margin-bottom:12px;box-sizing:border-box;' + estilo + '">' +
        '<button id="zf-l-ok" type="button" style="width:100%;padding:11px;background:#4A7C59;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;' + estilo + '">Entrar</button>' +
        '<div id="zf-l-erro" style="display:none;margin-top:10px;color:#9b3a2e;font-size:13px;text-align:center;"></div></div>';
      document.body.appendChild(ov);
      var $ = function (id) { return document.getElementById(id); };
      var erro = function (t) { var e = $('zf-l-erro'); e.textContent = t; e.style.display = 'block'; };
      var entrar = async function () {
        var u = $('zf-l-user').value.trim(), p = $('zf-l-pass').value;
        if (!u || !p) return;
        $('zf-l-ok').disabled = true;
        try {
          var d = await ZFAuth.login(url, u, p);
          if (!d || !d.ok) { erro((d && d.erro) || 'Usuário ou senha incorretos.'); }
          else if (perfis.indexOf(d.perfil) < 0) { ZFAuth.sair(url); erro('Sem permissão para esta página.'); }
          else { ov.remove(); if (opts.aoEntrar) opts.aoEntrar(d); }
        } catch (e) { erro('Não foi possível entrar agora. Tente de novo.'); }
        $('zf-l-ok').disabled = false;
      };
      $('zf-l-ok').onclick = entrar;
      $('zf-l-pass').onkeydown = function (ev) { if (ev.key === 'Enter') entrar(); };
      ZFAuth.esqueci(ZFAuth.urlEsqueci, $('zf-l-ok'), function () { return $('zf-l-user').value.trim(); });
      $('zf-l-user').focus();
    },

    // Cria o link "Esqueci a senha" logo depois do elemento `ancora` e o painel de redefinição.
    esqueci: function (url, ancora, getUsuario) {
      if (!ancora || document.getElementById('zf-esqueci-link')) return;
      ZFAuth.aquecer(url);
      var estilo = 'font-family:inherit;font-size:13px;';
      var link = document.createElement('a');
      link.id = 'zf-esqueci-link'; link.href = '#'; link.textContent = 'Esqueci a senha';
      link.style.cssText = estilo + 'display:block;text-align:center;margin-top:12px;color:#4A7C59;text-decoration:underline;cursor:pointer;';
      var box = document.createElement('div');
      box.id = 'zf-esqueci-box';
      box.style.cssText = 'display:none;margin-top:12px;padding:14px;border:1px solid #DDE0D8;border-radius:10px;background:#F7F9F6;' + estilo;
      box.innerHTML =
        '<div id="zf-e-msg" style="color:#5E6659;margin-bottom:10px;line-height:1.4">Informe seu usuário. Um código de 6 dígitos será enviado ao e-mail do RH, que vai repassá-lo a você.</div>' +
        '<input id="zf-e-user" type="text" placeholder="usuário" autocomplete="username" style="width:100%;padding:9px 11px;border:1px solid #DDE0D8;border-radius:8px;margin-bottom:8px;box-sizing:border-box;' + estilo + '">' +
        '<button id="zf-e-pedir" type="button" style="width:100%;padding:9px;background:#4A7C59;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;' + estilo + '">Enviar código ao RH</button>' +
        '<div id="zf-e-passo2" style="display:none;margin-top:12px">' +
        '<input id="zf-e-cod" type="text" inputmode="numeric" maxlength="6" placeholder="código de 6 dígitos" style="width:100%;padding:9px 11px;border:1px solid #DDE0D8;border-radius:8px;margin-bottom:8px;box-sizing:border-box;' + estilo + '">' +
        '<input id="zf-e-nova" type="password" placeholder="nova senha (mín. 10 caracteres)" autocomplete="new-password" style="width:100%;padding:9px 11px;border:1px solid #DDE0D8;border-radius:8px;margin-bottom:8px;box-sizing:border-box;' + estilo + '">' +
        '<button id="zf-e-salvar" type="button" style="width:100%;padding:9px;background:#2D5438;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;' + estilo + '">Salvar nova senha</button></div>';
      ancora.parentNode.insertBefore(link, ancora.nextSibling);
      link.parentNode.insertBefore(box, link.nextSibling);
      var $ = function (id) { return document.getElementById(id); };
      var msg = function (t, erro) {
        var m = $('zf-e-msg'); m.textContent = t;
        m.style.color = erro ? '#9b3a2e' : '#2D5438';
        m.style.fontWeight = '700';
        m.style.background = erro ? '#fbeceb' : '#e6f1e8';
        m.style.padding = '8px 10px'; m.style.borderRadius = '8px';
        try { m.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      };
      link.onclick = function (ev) {
        ev.preventDefault();
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
        if (getUsuario && !$('zf-e-user').value) $('zf-e-user').value = getUsuario() || '';
      };
      $('zf-e-pedir').onclick = async function () {
        var u = $('zf-e-user').value.trim();
        if (!u) { msg('Digite seu usuário.', true); return; }
        $('zf-e-pedir').disabled = true; $('zf-e-pedir').textContent = 'Enviando...';
        try {
          var r = await (await fetch(url + '?acao=esqueci&user=' + enc(u))).json();
          msg(r.msg || 'Pedido enviado. Peça o código ao RH.', !r.ok);
          if (r.ok) $('zf-e-passo2').style.display = 'block';
        } catch (e) { msg('Não foi possível enviar agora. Tente de novo.', true); }
        $('zf-e-pedir').disabled = false; $('zf-e-pedir').textContent = 'Enviar código ao RH';
      };
      $('zf-e-salvar').onclick = async function () {
        var u = $('zf-e-user').value.trim(), c = $('zf-e-cod').value.trim(), n = $('zf-e-nova').value;
        if (!u || !c || !n) { msg('Preencha usuário, código e nova senha.', true); return; }
        if (n.length < 10) { msg('A nova senha precisa ter pelo menos 10 caracteres.', true); return; }
        $('zf-e-salvar').disabled = true; $('zf-e-salvar').textContent = 'Salvando...';
        try {
          var r = await (await fetch(url + '?acao=redefinir&user=' + enc(u) + '&codigo=' + enc(c) + '&nova=' + enc(n))).json();
          msg(r.ok ? 'Senha alterada com sucesso. Agora é só entrar com a nova senha.' : (r.erro || 'Não foi possível redefinir.'), !r.ok);
          if (r.ok) { $('zf-e-passo2').style.display = 'none'; $('zf-e-nova').value = ''; $('zf-e-cod').value = ''; }
        } catch (e) { msg('Não foi possível salvar agora. Tente de novo.', true); }
        $('zf-e-salvar').disabled = false; $('zf-e-salvar').textContent = 'Salvar nova senha';
      };
    }
  };
  window.ZFAuth = ZFAuth;
  // Ao abrir a página, "acorda" os scripts do Google usados nela (o login fica mais rápido)
  document.addEventListener('DOMContentLoaded', function () {
    var vistos = {};
    Array.prototype.forEach.call(document.scripts, function (sc) {
      var achados = (sc.textContent || '').match(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/g) || [];
      achados.forEach(function (u) { if (!vistos[u]) { vistos[u] = 1; ZFAuth.aquecer(u); } });
    });
  });
})();
