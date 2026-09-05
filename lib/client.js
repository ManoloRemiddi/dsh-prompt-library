// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// DSH's public settings.section slot and settings RPC are the only host seams.
window.__ModuleLoader__.load({
  id: 'dsh-prompt-library',
  factory(require) {
    const React = require('react'), h = React.createElement;
    const NS = 'prompt-library';
    function apply(ctx) {
      const api = ctx.connection.api;
      const unwrap = response => {
        if (!response?.result?.ok) throw new Error(response?.result?.error?.message || 'DSH could not load the prompt library.');
        return response.result.value;
      };
      function LibraryPage() {
        const [library, setLibrary] = React.useState(null);
        const [form, setForm] = React.useState({id: null, name: '', content: ''});
        const [editing, setEditing] = React.useState(false);
        const [dirty, setDirty] = React.useState(false);
        const [query, setQuery] = React.useState('');
        const [status, setStatus] = React.useState('Loading prompts…');
        const [busy, setBusy] = React.useState(false);
        const alive = React.useRef(true), busyRef = React.useRef(false), formRef = React.useRef(form), editingRef = React.useRef(false);
        formRef.current = form; editingRef.current = editing;
        const load = async (syncForm = true) => {
          const result = unwrap(await api.settings.describe({}));
          const next = result.namespaces.find(row => row.ns === NS);
          if (!next) throw new Error('The Prompt library plugin is not running.');
          if (alive.current) {
            setLibrary(next);
            if (syncForm && !editingRef.current && formRef.current.id) setForm(next.value.prompts.find(p => p.id === formRef.current.id) || {id: null, name: '', content: ''});
          }
          return next;
        };
        React.useEffect(() => {
          alive.current = true;
          load().then(() => { if (alive.current) setStatus(''); }, error => { if (alive.current) setStatus(error.message); });
          const off = ctx.remote.$on('settings/document-updated', event => {
            if (event?.ns && event.ns !== NS || busyRef.current) return;
            if (editingRef.current) { setStatus('Settings changed. Refresh the library before saving; your draft will be kept.'); return; }
            load().catch(error => { if (alive.current) setStatus(error.message); });
          });
          return () => { alive.current = false; off(); };
        }, []);
        const select = item => {
          if (dirty && !window.confirm('Discard your unsaved prompt changes?')) return;
          setForm(item || {id: null, name: '', content: ''}); setEditing(!item); setDirty(false); setStatus('');
        };
        const cancelEdit = () => {
          setForm(library?.value.prompts.find(p => p.id === form.id) || {id: null, name: '', content: ''});
          setEditing(false); setDirty(false); setStatus('');
        };
        const edit = (key, value) => { setForm(prev => ({...prev, [key]: value})); setDirty(true); };
        const save = async remove => {
          if (!library || busyRef.current) return;
          if (remove && !window.confirm('Delete /' + form.name + '?')) return;
          busyRef.current = true; setBusy(true);
          try {
            let prompts = library.value.prompts.slice();
            if (form.id && !prompts.some(p => p.id === form.id)) throw new Error('This prompt was deleted elsewhere. Choose New prompt to save a copy.');
            const item = {id: form.id || crypto.randomUUID(), name: form.name.trim().replace(/^\//, '').toLowerCase(), content: form.content, updatedAt: new Date().toISOString()};
            if (remove) prompts = prompts.filter(p => p.id !== form.id);
            else if (form.id) prompts = prompts.map(p => p.id === form.id ? item : p);
            else prompts.push(item);
            unwrap(await api.settings.mutate({ns: NS, expectedRevision: library.revision, ops: [{op: 'set', path: ['prompts'], value: prompts}]}));
            await load();
            if (!alive.current) return;
            setForm(remove ? {id: null, name: '', content: ''} : item); setEditing(false); setDirty(false);
            setStatus(remove ? 'Prompt deleted.' : 'Saved. Type /' + item.name + ' in either Augmentor app.');
          } catch (error) { if (alive.current) setStatus(error.message); }
          finally { busyRef.current = false; if (alive.current) setBusy(false); }
        };
        const prompts = library?.value.prompts || [];
        const matches = prompts.filter(p => p.name.includes(query.toLowerCase().replace(/^\//, ''))).sort((a,b) => a.name.localeCompare(b.name));
        return h('section', {className: 'dsh-prompt-library', 'aria-label': 'Prompt library'},
          h('style', null, `.dsh-prompt-library{max-width:760px;padding:8px 4px 24px;font:14px/1.5 inherit}.dsh-prompt-library h2{margin:0 0 8px;font-size:21px}.dsh-prompt-library p{opacity:.8}.dsh-prompt-library input,.dsh-prompt-library textarea{display:block;width:100%;box-sizing:border-box;color:inherit;background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.35);border-radius:10px;padding:10px 12px;font:inherit}.dsh-prompt-library textarea{resize:vertical;min-height:170px}.dsh-prompt-library label{display:block;margin:16px 0 0}.dsh-prompt-library button{font:inherit;color:inherit;background:rgba(128,128,128,.1);border:1px solid rgba(128,128,128,.3);border-radius:9px;padding:7px 12px;cursor:pointer}.dsh-prompt-library button:hover{background:rgba(128,128,128,.23)}.dsh-prompt-library button:disabled{opacity:.4;cursor:default}.dsh-prompt-library .pl-bar{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}.dsh-prompt-library .pl-list{display:flex;flex-direction:column;gap:5px;max-height:185px;overflow:auto;margin:12px 0}.dsh-prompt-library .pl-list button{text-align:left}.dsh-prompt-library button[aria-pressed=true]{border-color:#62b4a0;background:rgba(98,180,160,.14)}.dsh-prompt-library .pl-status{min-height:24px;overflow-wrap:anywhere}`),
          h('style', null, `.dsh-prompt-library .pl-preview{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;padding:16px;border-radius:12px;background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.25);line-height:1.6}.dsh-prompt-library h3{font-size:16px;margin:20px 0 10px}.dsh-prompt-library .pl-list button small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.65;font-size:12px;margin-top:2px}`),
          h('h2', null, 'Prompt library'),
          h('p', null, 'Shared by both Augmentor apps. Click a prompt to preview it, or type / in chat to insert it into your draft.'),
          h('input', {'aria-label': 'Search saved prompts', placeholder: 'Search prompts…', value: query, onChange: e => setQuery(e.target.value)}),
          h('div', {className: 'pl-bar'},
            h('button', {type: 'button', disabled: busy, onClick: () => select(null)}, 'New prompt'),
            h('button', {type: 'button', disabled: busy, onClick: () => load(false).then(() => setStatus(editing ? 'Library refreshed. Your draft is kept.' : 'Library refreshed.'), e => setStatus(e.message))}, 'Refresh')),
          h('div', {className: 'pl-list'}, matches.map(p => h('button', {key: p.id, type: 'button', disabled: busy, 'aria-label': '/' + p.name, 'aria-pressed': p.id === form.id, onClick: () => select(p)}, '/' + p.name, h('small', {'aria-hidden': true}, p.content.replace(/\s+/g, ' ').slice(0, 100))))),
          library && !prompts.length && !editing && h('p', null, 'Your library is empty. Choose New prompt to get started.'),
          prompts.length > 0 && !matches.length && h('p', null, 'No matching prompts.'),
          !editing && !form.id && prompts.length > 0 && h('p', null, 'Select a prompt above to preview it.'),
          !editing && form.id && h(React.Fragment, null,
            h('h3', null, '/' + form.name),
            h('div', {className: 'pl-preview', role: 'region', 'aria-label': 'Prompt preview'}, form.content),
            h('div', {className: 'pl-bar'},
              h('button', {type: 'button', disabled: !library || busy, onClick: () => { setEditing(true); setStatus(''); }}, 'Edit'),
              h('button', {type: 'button', disabled: !library || busy, onClick: () => save(true)}, 'Delete prompt'))),
          editing && h(React.Fragment, null,
            h('h3', null, form.id ? 'Edit prompt' : 'New prompt'),
            h('label', null, 'Shortcut name', h('input', {'aria-label': 'Prompt shortcut name', placeholder: 'For example: summarise', maxLength: 41, disabled: busy, value: form.name, onChange: e => edit('name', e.target.value)})),
            h('label', null, 'Prompt text', h('textarea', {'aria-label': 'Saved prompt text', rows: 7, maxLength: 32000, disabled: busy, value: form.content, onChange: e => edit('content', e.target.value)})),
            h('div', {className: 'pl-bar'},
              h('button', {type: 'button', disabled: !library || busy || !form.name.trim() || !form.content.trim(), onClick: () => save(false)}, busy ? 'Saving…' : 'Save prompt'),
              h('button', {type: 'button', disabled: busy, onClick: cancelEdit}, 'Cancel'))),
          h('p', {role: 'status', className: 'pl-status'}, status),
          h('p', null, 'Stored locally in DSH. This library does not send prompts to a model.'));
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({name: 'settings.section', id: NS, order: 95, label: () => 'Prompt library'}, LibraryPage));
    }
    return {name: 'dsh-prompt-library', inject: ['slots', 'connection', 'remote'], apply};
  }
});
