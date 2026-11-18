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
    // Entra. Retorna o JSON do servidor ({ok, usuario, nome, perfil, sessao} ou {ok:false, erro})
    login: async function (url, user, pass) {
      var r = await fetch(url + '?acao=login&user=' + enc(user) + '&pass=' + enc(pass));
      var d = await r.json();
      if (d && d.ok && d.sessao) {
        try { sessionStorage.setItem(K(url), JSON.stringify({ sessao: d.sessao, nome: d.nome, perfil: d.perfil, usuario: d.usuario })); } catch (e) {}
      }
      return d;
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

    // Cria o link "Esqueci a senha" logo depois do elemento ancora e o painel de redefinição.
    esqueci: function (url, ancora, getUsuario) {
      if (!ancora || document.getElementById('zf-esqueci-link')) return;
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
      var msg = function (t, erro) { var m = $('zf-e-msg'); m.textContent = t; m.style.color = erro ? '#9b3a2e' : '#2D5438'; };
      link.onclick = function (ev) {
        ev.preventDefault();
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
        if (getUsuario && !$('zf-e-user').value) $('zf-e-user').value = getUsuario() || '';
      };
      $('zf-e-pedir').onclick = async function () {
        var u = $('zf-e-user').value.trim();
        if (!u) { msg('Digite seu usuário.', true); return; }
        $('zf-e-pedir').disabled = true;
        try {
          var r = await (await fetch(url + '?acao=esqueci&user=' + enc(u))).json();
          msg(r.msg || 'Pedido enviado. Peça o código ao RH.', !r.ok);
          if (r.ok) $('zf-e-passo2').style.display = 'block';
        } catch (e) { msg('Não foi possível enviar agora. Tente de novo.', true); }
        $('zf-e-pedir').disabled = false;
      };
      $('zf-e-salvar').onclick = async function () {
        var u = $('zf-e-user').value.trim(), c = $('zf-e-cod').value.trim(), n = $('zf-e-nova').value;
        if (!u || !c || !n) { msg('Preencha usuário, código e nova senha.', true); return; }
        $('zf-e-salvar').disabled = true;
        try {
          var r = await (await fetch(url + '?acao=redefinir&user=' + enc(u) + '&codigo=' + enc(c) + '&nova=' + enc(n))).json();
          msg(r.ok ? (r.msg || 'Senha redefinida.') : (r.erro || 'Não foi possível redefinir.'), !r.ok);
          if (r.ok) { $('zf-e-passo2').style.display = 'none'; $('zf-e-nova').value = ''; $('zf-e-cod').value = ''; }
        } catch (e) { msg('Não foi possível salvar agora. Tente de novo.', true); }
        $('zf-e-salvar').disabled = false;
      };
    }
  };
  window.ZFAuth = ZFAuth;
})();
