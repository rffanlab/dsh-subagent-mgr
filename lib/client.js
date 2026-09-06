(() => {
  const ID = 'dsh-subagent-mgr'
  window.__ModuleLoader__.load({
    id: ID,
    factory(require) {
      const React = require('react')
      const h = React.createElement
      const NS = 'subagent-mgr'
      const ID_RE = /^[a-z][a-z0-9_-]{0,47}$/
      const TOOL_RE = /^[a-z][a-z0-9_-]{0,63}$/
      const BUILTIN_BACKENDS = ['spawn', 'fork', 'dsh-sdk', 'codex', 'claude-code', 'acp']
      const css = `
.dsm{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;min-height:500px}.dsm *{box-sizing:border-box}
.dsm-side,.dsm-main{border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:12px;padding:14px;min-width:0}
.dsm-head,.dsm-row,.dsm-actions,.dsm-toolbar{display:flex;align-items:center;gap:8px}.dsm-head{justify-content:space-between;margin-bottom:10px}.dsm-toolbar{margin-bottom:10px}.dsm-actions{flex-wrap:wrap;justify-content:flex-end}
.dsm-list{display:grid;gap:6px;max-height:540px;overflow:auto}.dsm-item,.dsm-btn{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;background:transparent;color:inherit;cursor:pointer}
.dsm-item{padding:9px;text-align:left;display:grid;gap:3px}.dsm-item[data-on=true]{border-color:#4d6bfe;background:color-mix(in srgb,#4d6bfe 10%,transparent)}.dsm-item small{opacity:.62;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-btn{padding:7px 10px}.dsm-btn[data-p=true]{background:#4d6bfe;border-color:#4d6bfe;color:white}.dsm-btn[data-d=true]{color:#e95d67}.dsm-btn:disabled{opacity:.45;cursor:not-allowed}
.dsm-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.dsm-field{display:grid;gap:5px;font-size:12px}.dsm-wide{grid-column:1/-1}
.dsm-in,.dsm-sel,.dsm-ta{width:100%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;padding:8px}.dsm-ta{min-height:92px;resize:vertical}
.dsm-sec{display:grid;gap:10px;margin:14px 0}.dsm-sec>strong{font-size:12px;opacity:.68}.dsm-note{font-size:12px;opacity:.68}.dsm-status{margin:10px 0;padding:9px;border-radius:8px;background:color-mix(in srgb,#4d6bfe 10%,transparent)}.dsm-status[data-e=true]{color:#ff9aa2;background:color-mix(in srgb,#e95d67 12%,transparent)}
.dsm-conflict{border:1px solid color-mix(in srgb,#e9a23b 55%,transparent);background:color-mix(in srgb,#e9a23b 10%,transparent);padding:10px;border-radius:9px;display:grid;gap:8px}.dsm-checks{display:flex;gap:14px;flex-wrap:wrap}.dsm-empty{padding:40px;text-align:center;opacity:.65}
.dsm-badge{font-size:11px;padding:2px 6px;border-radius:999px;background:color-mix(in srgb,currentColor 9%,transparent)}.dsm-badge[data-kind=dirty]{background:color-mix(in srgb,#e9a23b 16%,transparent)}.dsm-badge[data-kind=on]{background:color-mix(in srgb,#4d6bfe 14%,transparent)}
@media(max-width:840px){.dsm{grid-template-columns:1fr}.dsm-grid{grid-template-columns:1fr}.dsm-wide{grid-column:auto}.dsm-list{max-height:280px}}`

      if (typeof document !== 'undefined' && !document.querySelector(`style[data-plugin-css="${ID}"]`)) {
        const tag = document.createElement('style')
        tag.dataset.plugin = ID
        tag.dataset.pluginCss = ID
        tag.textContent = css
        document.head.appendChild(tag)
      }

      const fingerprint = value => JSON.stringify(value ?? null)
      const list = value => [...new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean))]
      const blank = (id = '') => ({
        id,
        enabled: true,
        backend: 'spawn',
        toolName: id ? `sub_${id}` : '',
        llmProvider: '',
        model: '',
        reasoningEffort: '',
        maxTokens: '',
        dynamicModelSelection: false,
        enableRunInBackground: true,
        backgroundMode: 'one-shot',
        persona: '',
        allowTools: '',
        denyTools: '',
        maxDepth: '3',
      })
      const draftOf = profile => ({
        ...blank(profile.id),
        ...profile,
        llmProvider: profile.llmProvider ?? '',
        model: profile.model ?? '',
        reasoningEffort: profile.reasoningEffort ?? '',
        maxTokens: profile.maxTokens ?? '',
        persona: profile.persona ?? '',
        allowTools: Array.isArray(profile.allowTools) ? profile.allowTools.join(', ') : '',
        denyTools: Array.isArray(profile.denyTools) ? profile.denyTools.join(', ') : '',
        maxDepth: String(profile.maxDepth ?? 3),
      })
      const storedOf = draft => {
        const profile = {
          id: draft.id.trim(),
          enabled: draft.enabled !== false,
          backend: draft.backend.trim() || 'spawn',
          toolName: draft.toolName.trim(),
          dynamicModelSelection: draft.dynamicModelSelection === true,
          enableRunInBackground: draft.enableRunInBackground !== false,
          backgroundMode: draft.backgroundMode || 'one-shot',
          maxDepth: draft.maxDepth === 'provider-managed' ? 'provider-managed' : Number(draft.maxDepth),
        }
        if (draft.llmProvider.trim()) profile.llmProvider = draft.llmProvider.trim()
        if (draft.model.trim()) profile.model = draft.model.trim()
        if (draft.reasoningEffort.trim()) profile.reasoningEffort = draft.reasoningEffort.trim()
        if (String(draft.maxTokens).trim()) profile.maxTokens = Number(draft.maxTokens)
        if (draft.persona.trim()) profile.persona = draft.persona.trim()
        const allow = list(draft.allowTools)
        const deny = list(draft.denyTools)
        if (allow.length) profile.allowTools = allow
        if (deny.length) profile.denyTools = deny
        return profile
      }
      function validate(draft, profiles, editing) {
        const id = draft.id.trim()
        const toolName = draft.toolName.trim()
        if (!ID_RE.test(id)) return 'ID 格式不正确：小写字母开头，可含数字、_、-，最长 48。'
        if (!draft.backend.trim()) return 'Backend 不能为空。'
        if (!TOOL_RE.test(toolName)) return 'Tool name 格式不正确。'
        if ((!draft.llmProvider.trim()) !== (!draft.model.trim())) return 'Provider 和 Model 必须同时填写，或同时留空继承主代理。'
        if (String(draft.maxTokens).trim() && (!Number.isSafeInteger(Number(draft.maxTokens)) || Number(draft.maxTokens) < 1)) return 'Max tokens 必须是正整数。'
        if (draft.maxDepth !== 'provider-managed' && (!Number.isSafeInteger(Number(draft.maxDepth)) || Number(draft.maxDepth) < 0)) return 'Max depth 必须是非负整数或 provider-managed。'
        const overlap = list(draft.allowTools).filter(name => list(draft.denyTools).includes(name))
        if (overlap.length) return `allow/deny 冲突：${overlap.join(', ')}`
        if (editing !== id && profiles[id]) return `子代理 ${id} 已存在。`
        for (const [profileId, profile] of Object.entries(profiles)) {
          if (profileId !== editing && profile.toolName === toolName) return `Tool name 已被 ${profileId} 使用。`
        }
        return null
      }
      const decode = value => value && typeof value === 'object' && !Array.isArray(value)
        && value.profiles && typeof value.profiles === 'object' && !Array.isArray(value.profiles)
        ? value : undefined

      function useScope(scope) {
        return React.useSyncExternalStore(
          React.useCallback(listener => scope.subscribe(listener), [scope]),
          React.useCallback(() => scope.getSnapshot(), [scope]),
          React.useCallback(() => scope.getSnapshot(), [scope]),
        )
      }

      const Field = ({ label, wide, children }) => h('label', { className: `dsm-field${wide ? ' dsm-wide' : ''}` }, h('span', null, label), children)
      const Check = ({ label, checked, onChange }) => h('label', { className: 'dsm-row', style: { fontSize: 12 } }, h('input', { type: 'checkbox', checked, onChange: event => onChange(event.currentTarget.checked) }), label)
      const Badge = ({ kind, children }) => h('span', { className: 'dsm-badge', 'data-kind': kind }, children)

      function Manager({ scope, loadCatalog }) {
        const snap = useScope(scope)
        const profiles = snap.value?.profiles ?? {}
        const allIds = Object.keys(profiles).sort()
        const [query, setQuery] = React.useState('')
        const [selected, setSelected] = React.useState(null)
        const [editing, setEditing] = React.useState(null)
        const [draft, setDraft] = React.useState(null)
        const [baseline, setBaseline] = React.useState(null)
        const [baseRevision, setBaseRevision] = React.useState(null)
        const [dirty, setDirty] = React.useState(false)
        const [conflict, setConflict] = React.useState(false)
        const [catalog, setCatalog] = React.useState(null)
        const [catError, setCatError] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [status, setStatus] = React.useState(null)

        React.useEffect(() => {
          let live = true
          loadCatalog().then(value => { if (live) setCatalog(value) }, error => { if (live) setCatError(String(error?.message ?? error)) })
          return () => { live = false }
        }, [loadCatalog])

        React.useEffect(() => {
          if (!dirty || typeof window === 'undefined') return undefined
          const listener = event => { event.preventDefault(); event.returnValue = '' }
          window.addEventListener('beforeunload', listener)
          return () => window.removeEventListener('beforeunload', listener)
        }, [dirty])

        React.useEffect(() => {
          if (!draft) return
          if (editing !== null) {
            const current = profiles[editing]
            if (!dirty) {
              if (current) {
                setDraft(draftOf(current))
                setBaseline(fingerprint(current))
                setBaseRevision(snap.revision ?? null)
                setConflict(false)
              }
              return
            }
            if (fingerprint(current) !== baseline) setConflict(true)
            else if (!conflict) setBaseRevision(snap.revision ?? baseRevision)
            return
          }
          if (dirty) setBaseRevision(snap.revision ?? baseRevision)
        }, [snap.revision, profiles, editing, dirty, baseline, conflict])

        if (snap.status === 'loading') return h('div', { className: 'dsm-note' }, '正在读取子代理配置…')
        if (snap.status !== 'ready') return h('div', { className: 'dsm-empty' }, '当前 Web 页面没有可写的 Harness settings 通道；请从本机 Web 打开，或使用 /subagents。')

        const writable = snap.writable === true
        const normalizedQuery = query.trim().toLowerCase()
        const ids = allIds.filter(id => {
          if (!normalizedQuery) return true
          const profile = profiles[id]
          return [id, profile.toolName, profile.backend, profile.llmProvider, profile.model]
            .filter(Boolean).some(value => String(value).toLowerCase().includes(normalizedQuery))
        })

        const patch = change => {
          setDraft(current => current ? { ...current, ...change } : current)
          setDirty(true)
          setStatus(null)
        }
        const canLeaveDraft = () => !dirty || typeof window === 'undefined' || window.confirm('当前有未保存修改，确定放弃吗？')
        const openExisting = id => {
          if (!canLeaveDraft()) return
          const profile = profiles[id]
          if (!profile) return
          setSelected(id)
          setEditing(id)
          setDraft(draftOf(profile))
          setBaseline(fingerprint(profile))
          setBaseRevision(snap.revision ?? null)
          setDirty(false)
          setConflict(false)
          setStatus(null)
        }
        const startNew = () => {
          if (!canLeaveDraft()) return
          setSelected(null)
          setEditing(null)
          setDraft(blank(''))
          setBaseline(null)
          setBaseRevision(snap.revision ?? null)
          setDirty(false)
          setConflict(false)
          setStatus(null)
        }
        const discardExternal = () => {
          if (editing !== null && profiles[editing]) openExisting(editing)
          else startNew()
        }
        const keepMine = () => {
          const current = editing !== null ? profiles[editing] : undefined
          setBaseline(fingerprint(current))
          setBaseRevision(snap.revision ?? null)
          setConflict(false)
          setStatus({ e: false, t: '已基于最新版本重新套用你的草稿；请检查后保存。' })
        }

        const mutateProfiles = async (next, revision = snap.revision) => {
          setBusy(true)
          try {
            await scope.mutate([{ op: 'set', path: ['profiles'], value: next }], revision ?? undefined)
            return scope.getSnapshot()
          } finally {
            setBusy(false)
          }
        }

        const save = async () => {
          if (!draft || busy || !writable) return
          if (conflict) {
            setStatus({ e: true, t: '当前配置已在别处变化。先选择“加载外部版本”或“保留我的草稿”。' })
            return
          }
          const error = validate(draft, profiles, editing)
          if (error) { setStatus({ e: true, t: error }); return }
          const profile = storedOf(draft)
          const next = structuredClone(profiles)
          if (editing && editing !== profile.id) delete next[editing]
          next[profile.id] = profile
          try {
            const after = await mutateProfiles(next, baseRevision)
            const accepted = after.value?.profiles?.[profile.id]
            if (fingerprint(accepted) !== fingerprint(profile)) {
              setConflict(true)
              throw new Error('保存被 revision 冲突或 Host 校验拒绝；没有覆盖外部的新修改。')
            }
            setSelected(profile.id)
            setEditing(profile.id)
            setDraft(draftOf(accepted))
            setBaseline(fingerprint(accepted))
            setBaseRevision(after.revision ?? null)
            setDirty(false)
            setConflict(false)
            setStatus({ e: false, t: '已保存并热更新。' })
          } catch (error) {
            setStatus({ e: true, t: String(error?.message ?? error) })
          }
        }

        const remove = async id => {
          if (!writable || busy) return
          if (typeof window !== 'undefined' && !window.confirm(`删除子代理 ${id}？`)) return
          const next = structuredClone(profiles)
          delete next[id]
          try {
            const after = await mutateProfiles(next, snap.revision)
            if (after.value?.profiles?.[id]) throw new Error('删除被并发修改或 Host 校验拒绝。')
            setSelected(null); setEditing(null); setDraft(null); setDirty(false); setConflict(false)
          } catch (error) { setStatus({ e: true, t: String(error?.message ?? error) }) }
        }
        const toggle = async (id, on) => {
          if (!writable || busy) return
          const next = structuredClone(profiles)
          next[id] = { ...next[id], enabled: on }
          try {
            const after = await mutateProfiles(next, snap.revision)
            if (after.value?.profiles?.[id]?.enabled !== on) throw new Error('启停操作被并发修改或 Host 校验拒绝。')
          } catch (error) { setStatus({ e: true, t: String(error?.message ?? error) }) }
        }
        const clone = () => {
          if (!draft || !canLeaveDraft()) return
          let index = 1
          let id
          do { id = `${draft.id.slice(0, 38)}${index === 1 ? '_copy' : `_copy${index}`}`; index += 1 } while (profiles[id])
          setSelected(null)
          setEditing(null)
          setDraft({ ...draft, id, toolName: `sub_${id}` })
          setBaseline(null)
          setBaseRevision(snap.revision ?? null)
          setDirty(true)
          setConflict(false)
          setStatus(null)
        }

        const input = (value, onChange, extra = {}) => h('input', { className: 'dsm-in', value, onChange: event => onChange(event.currentTarget.value), ...extra })
        const group = catalog?.groups?.find(item => item.id === draft?.llmProvider)
        const models = group?.models ?? []
        const route = models.find(model => model.id === draft?.model)
        const efforts = route?.reasoning?.efforts ?? []

        const identitySection = draft && h('section', { className: 'dsm-sec' }, [
          h('strong', { key: 'title' }, '身份与运行'),
          h('div', { className: 'dsm-grid', key: 'grid' }, [
            h(Field, { label: 'ID', key: 'id' }, input(draft.id, value => {
              const autoTool = !draft.toolName || draft.toolName === `sub_${draft.id}`
              patch({ id: value, ...(autoTool ? { toolName: value ? `sub_${value}` : '' } : {}) })
            }, { disabled: editing !== null, placeholder: 'local_worker' })),
            h(Field, { label: 'Tool name', key: 'tool' }, input(draft.toolName, value => patch({ toolName: value }), { placeholder: 'sub_local_worker' })),
            h(Field, { label: 'Subagent backend', key: 'backend' }, h(React.Fragment, null,
              input(draft.backend, value => patch({ backend: value }), { list: 'dsm-backends' }),
              h('datalist', { id: 'dsm-backends' }, BUILTIN_BACKENDS.map(value => h('option', { key: value, value }))),
            )),
            h(Field, { label: 'Background mode', key: 'bg' }, h('select', { className: 'dsm-sel', value: draft.backgroundMode, onChange: event => patch({ backgroundMode: event.currentTarget.value }) },
              h('option', { value: 'one-shot' }, 'one-shot'),
              h('option', { value: 'continuable' }, 'continuable（可继续）'),
            )),
            h(Field, { label: 'Max depth', key: 'depth' }, input(draft.maxDepth, value => patch({ maxDepth: value }), { placeholder: '3 / provider-managed' })),
            h(Field, { label: 'Max tokens（可选）', key: 'tokens' }, input(draft.maxTokens, value => patch({ maxTokens: value }), { type: 'number', min: 1, placeholder: '继承默认' })),
          ]),
          h('div', { className: 'dsm-checks', key: 'checks' }, [
            h(Check, { key: 'enabled', label: '启用', checked: draft.enabled !== false, onChange: value => patch({ enabled: value }) }),
            h(Check, { key: 'bgallow', label: '允许 run_in_background', checked: draft.enableRunInBackground !== false, onChange: value => patch({ enableRunInBackground: value }) }),
            h(Check, { key: 'dynamic', label: '动态选模型', checked: draft.dynamicModelSelection === true, onChange: value => patch({ dynamicModelSelection: value }) }),
          ]),
          h('div', { className: 'dsm-note', key: 'cap' }, 'Host 保存时会按当前 Harness backend capabilities 再校验；不支持的模型覆盖、Persona、工具过滤或 continuable 不会静默生效。'),
        ])

        const modelSection = draft && h('section', { className: 'dsm-sec' }, [
          h('div', { className: 'dsm-head', key: 'title' }, [
            h('strong', { key: 'label', style: { fontSize: 12, opacity: .68 } }, '模型路由'),
            h('button', { key: 'inherit', type: 'button', className: 'dsm-btn', onClick: () => patch({ llmProvider: '', model: '', reasoningEffort: '' }) }, '继承主代理'),
          ]),
          h('div', { className: 'dsm-grid', key: 'grid' }, [
            h(Field, { label: 'LLM provider（空=继承）', key: 'provider' }, h(React.Fragment, null,
              input(draft.llmProvider, value => patch({ llmProvider: value, ...(!value ? { model: '', reasoningEffort: '' } : {}) }), { list: 'dsm-providers', placeholder: catalog?.default?.provider ?? '例如 ollama' }),
              h('datalist', { id: 'dsm-providers' }, (catalog?.groups ?? []).map(item => h('option', { key: item.id, value: item.id, label: item.name }))),
            )),
            h(Field, { label: 'Model（空=继承）', key: 'model' }, h(React.Fragment, null,
              input(draft.model, value => patch({ model: value, reasoningEffort: '' }), { list: 'dsm-models', placeholder: catalog?.default?.model ?? '模型 ID' }),
              h('datalist', { id: 'dsm-models' }, models.map(model => h('option', { key: model.id, value: model.id, label: model.name }))),
            )),
            h(Field, { label: 'Reasoning effort', key: 'effort' }, h(React.Fragment, null,
              input(draft.reasoningEffort, value => patch({ reasoningEffort: value }), { list: 'dsm-efforts', placeholder: route?.reasoning?.defaultEffort ?? '模型默认' }),
              h('datalist', { id: 'dsm-efforts' }, efforts.map(effort => h('option', { key: effort.id, value: effort.id, label: effort.name }))),
            )),
            h('div', { className: 'dsm-note', key: 'note' }, catError
              ? `模型目录读取失败：${catError}；仍可手填。`
              : catalog ? `已读取 ${catalog.groups.length} 个 provider；仍可手填自定义路由。` : '正在读取 Harness 模型目录…'),
          ]),
        ])

        const roleSection = draft && h('section', { className: 'dsm-sec' }, [
          h('strong', { key: 'title' }, '角色与工具'),
          h(Field, { label: 'Persona / 岗位职责', wide: true, key: 'persona' }, h('textarea', {
            className: 'dsm-ta', value: draft.persona, onChange: event => patch({ persona: event.currentTarget.value }),
            placeholder: '负责重复实现、搜索代码和跑测试；架构决策交回主代理。',
          })),
          h('div', { className: 'dsm-grid', key: 'tools' }, [
            h(Field, { label: 'Tool allowlist（逗号）', key: 'allow' }, input(draft.allowTools, value => patch({ allowTools: value }), { placeholder: 'read_file, grep' })),
            h(Field, { label: 'Tool denylist（逗号）', key: 'deny' }, input(draft.denyTools, value => patch({ denyTools: value }), { placeholder: 'dangerous_tool' })),
          ]),
        ])

        const conflictPanel = conflict && h('div', { className: 'dsm-conflict' }, [
          h('strong', { key: 'title' }, '检测到并发修改'),
          h('div', { className: 'dsm-note', key: 'text' }, '这个子代理在你编辑期间被另一个窗口、/subagents 命令或 settings 文件修改。你的草稿没有被覆盖。'),
          h('div', { className: 'dsm-actions', key: 'actions' }, [
            h('button', { className: 'dsm-btn', key: 'external', onClick: discardExternal }, '加载外部版本'),
            h('button', { className: 'dsm-btn', 'data-p': true, key: 'mine', onClick: keepMine }, '保留我的草稿'),
          ]),
        ])

        const editor = !draft ? h('div', { className: 'dsm-empty' }, '选择左侧子代理，或新增一个角色。') : h(React.Fragment, null, [
          h('div', { className: 'dsm-head', key: 'head' }, [
            h('div', { key: 'name' }, [
              h('div', { className: 'dsm-row', key: 'line' }, [
                h('strong', { key: 'title' }, editing ?? '新建子代理'),
                dirty ? h(Badge, { key: 'dirty', kind: 'dirty' }, '未保存') : null,
              ]),
              h('div', { className: 'dsm-note', key: 'desc' }, editing ? `Tool: ${draft.toolName}` : '保存后立即挂载官方 dsh-tool-subagent。'),
            ]),
            h('div', { className: 'dsm-actions', key: 'actions' }, [
              editing ? h('button', { className: 'dsm-btn', key: 'clone', disabled: busy, onClick: clone }, '复制') : null,
              editing ? h('button', { className: 'dsm-btn', 'data-d': true, key: 'delete', disabled: busy || !writable, onClick: () => remove(editing) }, '删除') : null,
              dirty ? h('button', { className: 'dsm-btn', key: 'discard', disabled: busy, onClick: discardExternal }, '放弃修改') : null,
              h('button', { className: 'dsm-btn', 'data-p': true, key: 'save', disabled: busy || !writable || !dirty || conflict, onClick: save }, busy ? '保存中…' : '保存'),
            ]),
          ]),
          conflictPanel,
          status ? h('div', { className: 'dsm-status', 'data-e': status.e ? 'true' : undefined, key: 'status' }, status.t) : null,
          identitySection,
          modelSection,
          roleSection,
        ])

        return h('div', { className: 'dsm' }, [
          h('aside', { className: 'dsm-side', key: 'side' }, [
            h('div', { className: 'dsm-head', key: 'head' }, [
              h('div', { key: 'title' }, [h('strong', { key: 'name' }, '子代理'), h('div', { className: 'dsm-note', key: 'count' }, `${allIds.length} 个角色`)]),
              h('button', { type: 'button', className: 'dsm-btn', 'data-p': true, key: 'add', disabled: busy || !writable, onClick: startNew }, '新增'),
            ]),
            h('div', { className: 'dsm-toolbar', key: 'search' }, input(query, setQuery, { type: 'search', placeholder: '搜索 ID / tool / backend / model' })),
            h('div', { className: 'dsm-list', key: 'list' }, ids.length ? ids.map(id => {
              const profile = profiles[id]
              const routeText = profile.llmProvider ? `${profile.llmProvider}/${profile.model}` : '继承主代理'
              return h('div', { className: 'dsm-row', key: id }, [
                h('button', { className: 'dsm-item', style: { flex: 1 }, 'data-on': selected === id ? 'true' : undefined, onClick: () => openExisting(id) }, [
                  h('span', { className: 'dsm-row', key: 'top' }, [
                    h('strong', { key: 'id' }, id),
                    h(Badge, { key: 'state', kind: profile.enabled === false ? 'off' : 'on' }, profile.enabled === false ? '停用' : '启用'),
                  ]),
                  h('small', { key: 'route' }, `${profile.backend} · ${routeText}`),
                ]),
                h('input', { key: 'toggle', type: 'checkbox', checked: profile.enabled !== false, disabled: busy || !writable, title: '启用/停用', onChange: event => toggle(id, event.currentTarget.checked) }),
              ])
            }) : h('div', { className: 'dsm-note' }, normalizedQuery ? '没有匹配的子代理。' : '还没有子代理。')),
            h('div', { className: 'dsm-note', style: { marginTop: 12 }, key: 'hint' }, '配置使用 Harness settings revision 防冲突；命令行 /subagents 与此页面共享同一份状态。'),
          ]),
          h('main', { className: 'dsm-main', key: 'main' }, editor),
        ])
      }

      const inject = ['slots', 'settingsScope', 'remote', 'remote.session']
      function apply(ctx) {
        const scope = ctx.settingsScope.bind({ namespace: NS, decode })
        const loadCatalog = async () => {
          const response = await ctx.remote.session.modelCatalog()
          if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
          return response.value
        }
        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'subagents',
          order: 20,
          label: '子代理',
          inject: () => ({ scope, loadCatalog }),
        }, Manager))
      }
      return { inject, apply }
    },
  })
})()
