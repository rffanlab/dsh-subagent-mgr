(() => {
  const ID = 'dsh-subagent-mgr'
  window.__ModuleLoader__.load({
    id: ID,
    factory(require) {
      const React = require('react')
      const h = React.createElement
      const css = `
.dsm{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;min-height:480px}
.dsm *{box-sizing:border-box}.dsm-side,.dsm-main{border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:12px;padding:14px}
.dsm-head,.dsm-row,.dsm-actions,.dsm-health{display:flex;align-items:center;gap:8px}.dsm-head{justify-content:space-between;margin-bottom:10px}
.dsm-list{display:grid;gap:6px}.dsm-item,.dsm-btn{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;background:transparent;color:inherit;cursor:pointer}
.dsm-item{padding:9px;text-align:left;display:grid;gap:3px}.dsm-item[data-on=true]{border-color:#4d6bfe;background:color-mix(in srgb,#4d6bfe 10%,transparent)}
.dsm-btn{padding:7px 10px}.dsm-btn[data-p=true]{background:#4d6bfe;border-color:#4d6bfe;color:white}.dsm-btn[data-d=true]{color:#e95d67}.dsm-btn:disabled{opacity:.45;cursor:not-allowed}
.dsm-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.dsm-field{display:grid;gap:5px;font-size:12px}.dsm-wide{grid-column:1/-1}
.dsm-in,.dsm-sel,.dsm-ta{width:100%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;padding:8px}
.dsm-in:disabled,.dsm-sel:disabled,.dsm-ta:disabled{opacity:.55}.dsm-ta{min-height:90px;resize:vertical}
.dsm-sec{display:grid;gap:10px;margin:14px 0}.dsm-sec>strong{font-size:12px;opacity:.7}.dsm-note{font-size:12px;opacity:.68;line-height:1.45}.dsm-status{margin:10px 0;padding:8px;border-radius:8px;background:color-mix(in srgb,#4d6bfe 10%,transparent)}
.dsm-status[data-e=true]{color:#ff9aa2;background:color-mix(in srgb,#e95d67 12%,transparent)}.dsm-status[data-w=true]{color:#e7b35a;background:color-mix(in srgb,#e7b35a 12%,transparent)}
.dsm-checks{display:flex;gap:14px;flex-wrap:wrap}.dsm-empty{padding:40px;text-align:center;opacity:.65}
.dsm-search{margin-bottom:9px}.dsm-badge{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 18%,transparent)}
.dsm-badge[data-k=ok]{color:#65c68a}.dsm-badge[data-k=warn]{color:#e7b35a}.dsm-badge[data-k=off]{opacity:.55}.dsm-badge[data-k=info]{color:#85a7ff}
.dsm-cap{display:grid;gap:5px;padding:9px;border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent)}.dsm-capline{display:flex;gap:6px;flex-wrap:wrap}
.dsm-conflict{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.dsm-divider{height:1px;background:color-mix(in srgb,currentColor 12%,transparent);margin:8px 0}
@media(max-width:820px){.dsm{grid-template-columns:1fr}.dsm-grid{grid-template-columns:1fr}.dsm-wide{grid-column:auto}}`
      if (typeof document !== 'undefined' && !document.querySelector(`style[data-plugin-css="${ID}"]`)) {
        const s = document.createElement('style')
        s.dataset.plugin = ID
        s.dataset.pluginCss = ID
        s.textContent = css
        document.head.appendChild(s)
      }

      const ID_RE = /^[a-z][a-z0-9_-]{0,47}$/
      const TOOL_RE = /^[a-z][a-z0-9_-]{0,63}$/
      const BACKENDS = ['spawn', 'fork', 'dsh-sdk', 'codex', 'claude-code', 'acp']
      const HINTS = {
        spawn: { agentOptions:true, depth:true, tools:true, persona:true, continuable:true, route:'parent', label:'Spawn in-process' },
        fork: { agentOptions:true, depth:true, tools:true, persona:true, continuable:true, route:'parent', label:'Fork in-process' },
        'dsh-sdk': { agentOptions:true, depth:false, tools:false, persona:false, continuable:false, route:'child', label:'DSH SDK' },
        codex: { agentOptions:false, depth:false, tools:false, persona:false, continuable:false, route:'backend', label:'Codex' },
        'claude-code': { agentOptions:false, depth:false, tools:false, persona:false, continuable:false, route:'backend', label:'Claude Code' },
        acp: { agentOptions:false, depth:false, tools:false, persona:false, continuable:false, route:'backend', label:'ACP' },
      }
      const list = value => [...new Set(String(value || '').split(',').map(x => x.trim()).filter(Boolean))]
      const stable = value => JSON.stringify(value)
      const blank = (id='') => ({
        id, enabled:true, backend:'spawn', toolName:id ? `sub_${id}` : '',
        llmProvider:'', model:'', reasoningEffort:'', maxTokens:'',
        dynamicModelSelection:false, enableRunInBackground:true,
        backgroundMode:'one-shot', persona:'', allowTools:'', denyTools:'', maxDepth:'3',
      })
      const draftOf = profile => ({
        ...blank(profile.id), ...profile,
        llmProvider:profile.llmProvider ?? '', model:profile.model ?? '',
        reasoningEffort:profile.reasoningEffort ?? '', maxTokens:profile.maxTokens ?? '',
        persona:profile.persona ?? '',
        allowTools:Array.isArray(profile.allowTools) ? profile.allowTools.join(', ') : '',
        denyTools:Array.isArray(profile.denyTools) ? profile.denyTools.join(', ') : '',
        maxDepth:String(profile.maxDepth ?? 3),
      })
      const storedOf = draft => {
        const profile = {
          id:draft.id.trim(), enabled:draft.enabled !== false,
          backend:draft.backend.trim() || 'spawn', toolName:draft.toolName.trim(),
          dynamicModelSelection:draft.dynamicModelSelection === true,
          enableRunInBackground:draft.enableRunInBackground !== false,
          backgroundMode:draft.backgroundMode || 'one-shot',
          maxDepth:draft.maxDepth === 'provider-managed' ? 'provider-managed' : Number(draft.maxDepth),
        }
        if (draft.llmProvider.trim()) profile.llmProvider = draft.llmProvider.trim()
        if (draft.model.trim()) profile.model = draft.model.trim()
        if (draft.reasoningEffort.trim()) profile.reasoningEffort = draft.reasoningEffort.trim()
        if (String(draft.maxTokens).trim()) profile.maxTokens = Number(draft.maxTokens)
        if (draft.persona.trim()) profile.persona = draft.persona.trim()
        const allow = list(draft.allowTools), deny = list(draft.denyTools)
        if (allow.length) profile.allowTools = allow
        if (deny.length) profile.denyTools = deny
        return profile
      }
      const useScope = scope => React.useSyncExternalStore(
        React.useCallback(fn => scope.subscribe(fn), [scope]),
        React.useCallback(() => scope.getSnapshot(), [scope]),
        React.useCallback(() => scope.getSnapshot(), [scope]),
      )
      const Field = ({ label, wide, children }) => h('label', { className:`dsm-field${wide ? ' dsm-wide' : ''}` }, h('span', null, label), children)
      const Check = ({ label, checked, onChange, disabled }) => h('label', { className:'dsm-row', style:{fontSize:12, opacity:disabled ? .5 : 1} },
        h('input', { type:'checkbox', checked, disabled, onChange:e => onChange(e.currentTarget.checked) }), label)
      const Badge = ({ kind='info', children }) => h('span', { className:'dsm-badge', 'data-k':kind }, children)

      function hintProblems(draft) {
        const hint = HINTS[draft.backend]
        if (!hint) return []
        const problems = []
        const usesAgentOptions = !!draft.llmProvider.trim() || !!draft.model.trim()
          || !!draft.reasoningEffort.trim() || !!String(draft.maxTokens).trim()
          || draft.dynamicModelSelection === true
        if (usesAgentOptions && !hint.agentOptions) problems.push('该 backend 不接受子代理模型/agentOptions 覆盖')
        if (draft.persona.trim() && !hint.persona) problems.push('该 backend 不接受 Persona 覆盖')
        if ((list(draft.allowTools).length || list(draft.denyTools).length) && !hint.tools) problems.push('该 backend 不接受 Tool 过滤')
        if (draft.maxDepth !== 'provider-managed' && !hint.depth) problems.push('该 backend 不能执行数字 maxDepth')
        if (draft.backgroundMode === 'continuable' && !hint.continuable) problems.push('该 backend 不支持 continuable')
        return problems
      }

      function routeHealth(draft, catalog) {
        if (!draft.llmProvider.trim() || !draft.model.trim()) return { kind:'info', text:'继承主代理/后端默认模型' }
        const hint = HINTS[draft.backend]
        if (hint?.route === 'child') return { kind:'info', text:'路由由子 DSH runtime 校验' }
        if (hint?.route === 'backend') return { kind:'info', text:'模型由 backend 自己管理' }
        if (!catalog) return { kind:'info', text:'模型目录读取中' }
        const group = catalog.groups?.find(g => g.id === draft.llmProvider)
        if (!group) return { kind:'warn', text:`Provider ${draft.llmProvider} 当前未注册` }
        const model = group.models?.find(m => m.id === draft.model)
        if (!model) return { kind:'info', text:'Provider 可用；模型未在目录公布（可能是动态模型）' }
        return { kind:'ok', text:`${group.name} / ${model.name}` }
      }

      function validate(draft, profiles, editing) {
        if (!ID_RE.test(draft.id.trim())) return 'ID 格式不正确（小写字母开头，可含数字、_、-，最长 48）。'
        if (!draft.backend.trim()) return 'Backend 不能为空。'
        if (!TOOL_RE.test(draft.toolName.trim())) return 'Tool name 格式不正确。'
        if ((!draft.llmProvider.trim()) !== (!draft.model.trim())) return 'Provider 和 Model 必须同时填写，或同时留空继承。'
        if (String(draft.maxTokens).trim() && (!Number.isSafeInteger(Number(draft.maxTokens)) || Number(draft.maxTokens) < 1)) return 'Max tokens 必须是正整数。'
        if (draft.maxDepth !== 'provider-managed' && (!Number.isSafeInteger(Number(draft.maxDepth)) || Number(draft.maxDepth) < 0)) return 'Max depth 必须是非负整数或 provider-managed。'
        const overlap = list(draft.allowTools).filter(x => list(draft.denyTools).includes(x))
        if (overlap.length) return `allow/deny 冲突：${overlap.join(', ')}`
        if (editing !== draft.id.trim() && profiles[draft.id.trim()]) return `子代理 ${draft.id.trim()} 已存在。`
        for (const [id, profile] of Object.entries(profiles)) {
          if (id !== editing && profile.toolName === draft.toolName.trim()) return `Tool name 已被 ${id} 使用。`
        }
        const hinted = hintProblems(draft)
        if (hinted.length) return hinted.join('；')
        return null
      }

      function clearUnsupported(draft) {
        const hint = HINTS[draft.backend]
        if (!hint) return draft
        const next = { ...draft }
        if (!hint.agentOptions) {
          next.llmProvider = ''; next.model = ''; next.reasoningEffort = ''; next.maxTokens = ''; next.dynamicModelSelection = false
        }
        if (!hint.persona) next.persona = ''
        if (!hint.tools) { next.allowTools = ''; next.denyTools = '' }
        if (!hint.depth) next.maxDepth = 'provider-managed'
        if (!hint.continuable) next.backgroundMode = 'one-shot'
        return next
      }

      function Manager({ scope, loadCatalog }) {
        const snap = useScope(scope)
        const profiles = snap.value?.profiles ?? {}
        const ids = Object.keys(profiles).sort()
        const [query, setQuery] = React.useState('')
        const [selected, setSelected] = React.useState(null)
        const [editing, setEditing] = React.useState(null)
        const [draft, setDraft] = React.useState(null)
        const [baseRevision, setBaseRevision] = React.useState(null)
        const [baseProfile, setBaseProfile] = React.useState(null)
        const [externalConflict, setExternalConflict] = React.useState(false)
        const [catalog, setCatalog] = React.useState(null)
        const [catError, setCatError] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [status, setStatus] = React.useState(null)

        React.useEffect(() => {
          let live = true
          loadCatalog().then(value => { if (live) setCatalog(value) }, error => { if (live) setCatError(String(error?.message ?? error)) })
          return () => { live = false }
        }, [loadCatalog])

        const dirty = !!draft && stable(storedOf(draft)) !== stable(baseProfile)
        React.useEffect(() => {
          if (!selected) return
          const current = profiles[selected]
          if (!current) {
            if (!dirty) { setSelected(null); setEditing(null); setDraft(null); setBaseProfile(null); setExternalConflict(false) }
            else setExternalConflict(true)
            return
          }
          if (editing !== selected || baseProfile === null) {
            setEditing(selected); setDraft(draftOf(current)); setBaseProfile(current); setBaseRevision(snap.revision); setExternalConflict(false)
            return
          }
          if (stable(current) !== stable(baseProfile)) {
            if (dirty) setExternalConflict(true)
            else {
              setDraft(draftOf(current)); setBaseProfile(current); setBaseRevision(snap.revision); setExternalConflict(false)
            }
          }
        }, [selected, profiles, snap.revision])

        if (snap.status === 'loading') return h('div', { className:'dsm-note' }, '正在读取子代理配置…')
        if (snap.status !== 'ready') return h('div', { className:'dsm-empty' }, '当前 Web 页面没有可写的 Harness settings 通道；请从本机 Web 打开，或使用 /subagents。')

        const writable = snap.writable === true
        const patch = values => setDraft(current => current ? { ...current, ...values } : current)
        const hint = draft ? HINTS[draft.backend] : undefined
        const group = catalog?.groups?.find(g => g.id === draft?.llmProvider)
        const models = group?.models ?? []
        const route = models.find(m => m.id === draft?.model)
        const efforts = route?.reasoning?.efforts ?? []
        const hintedProblems = draft ? hintProblems(draft) : []
        const health = draft ? routeHealth(draft, catalog) : null

        const mutateProfiles = async (next, revision=snap.revision) => {
          setBusy(true)
          try {
            await scope.mutate([{ op:'set', path:['profiles'], value:next }], revision)
          } finally {
            setBusy(false)
          }
        }

        const acceptCurrent = id => {
          const accepted = scope.getSnapshot().value?.profiles?.[id]
          if (!accepted) return false
          setSelected(id); setEditing(id); setDraft(draftOf(accepted)); setBaseProfile(accepted)
          setBaseRevision(scope.getSnapshot().revision); setExternalConflict(false)
          return true
        }

        const save = async () => {
          if (!draft) return
          const error = validate(draft, profiles, editing)
          if (error) { setStatus({ e:true, t:error }); return }
          if (externalConflict) { setStatus({ e:true, t:'存在并发修改；请先选择“加载外部版本”或确认保留当前草稿。' }); return }
          const profile = storedOf(draft)
          const next = structuredClone(profiles)
          if (editing && editing !== profile.id) delete next[editing]
          next[profile.id] = profile
          try {
            await mutateProfiles(next, baseRevision ?? snap.revision)
            if (!acceptCurrent(profile.id) || stable(scope.getSnapshot().value?.profiles?.[profile.id]) !== stable(profile)) {
              throw new Error('保存未被 Harness 接受，可能发生了 revision 冲突。配置已重新同步。')
            }
            setStatus({ e:false, t:'已保存并热更新。' })
          } catch (error) {
            setStatus({ e:true, t:String(error?.message ?? error) })
          }
        }

        const choose = id => {
          if (dirty && id !== selected && typeof window !== 'undefined' && !window.confirm('当前有未保存修改，确定切换？')) return
          setSelected(id); setEditing(null); setBaseProfile(null); setExternalConflict(false); setStatus(null)
        }
        const create = () => {
          if (dirty && typeof window !== 'undefined' && !window.confirm('当前有未保存修改，确定新建？')) return
          setSelected(null); setEditing(null); setBaseProfile(null); setBaseRevision(snap.revision); setExternalConflict(false); setDraft(blank('')); setStatus(null)
        }
        const remove = async id => {
          if (!writable || busy) return
          if (typeof window !== 'undefined' && !window.confirm(`删除子代理 ${id}？`)) return
          const next = structuredClone(profiles); delete next[id]
          try { await mutateProfiles(next); setSelected(null); setEditing(null); setDraft(null); setBaseProfile(null) }
          catch (error) { setStatus({ e:true, t:String(error?.message ?? error) }) }
        }
        const toggle = async (id, on) => {
          const next = structuredClone(profiles); next[id] = { ...next[id], enabled:on }
          try { await mutateProfiles(next) } catch (error) { setStatus({ e:true, t:String(error?.message ?? error) }) }
        }
        const clone = () => {
          if (!draft) return
          let n = 1, id
          do { id = `${draft.id.slice(0, 38)}${n === 1 ? '_copy' : `_copy${n}`}`; n += 1 } while (profiles[id])
          setSelected(null); setEditing(null); setBaseProfile(null); setBaseRevision(snap.revision); setExternalConflict(false)
          setDraft({ ...draft, id, toolName:`sub_${id}` })
        }
        const input = (value, onChange, extra={}) => h('input', { className:'dsm-in', value, onChange:e => onChange(e.currentTarget.value), ...extra })

        const filteredIds = ids.filter(id => {
          const q = query.trim().toLowerCase()
          if (!q) return true
          const p = profiles[id]
          return [id, p.toolName, p.backend, p.llmProvider, p.model, p.persona].filter(Boolean).some(v => String(v).toLowerCase().includes(q))
        })

        const capabilityBox = draft && h('div', { className:'dsm-cap' }, [
          h('div', { className:'dsm-health', key:'head' }, [
            h('strong', { style:{fontSize:12}, key:'name' }, hint ? hint.label : 'Custom backend'),
            h(Badge, { kind:hint ? 'info' : 'off', key:'kind' }, hint ? '官方默认能力提示' : '能力由 Host 校验'),
            health && h(Badge, { kind:health.kind, key:'route' }, health.text),
          ]),
          hint && h('div', { className:'dsm-capline', key:'caps' }, [
            h(Badge, { kind:hint.agentOptions?'ok':'off', key:'a' }, `模型覆盖 ${hint.agentOptions?'✓':'×'}`),
            h(Badge, { kind:hint.persona?'ok':'off', key:'p' }, `Persona ${hint.persona?'✓':'×'}`),
            h(Badge, { kind:hint.tools?'ok':'off', key:'t' }, `Tool filter ${hint.tools?'✓':'×'}`),
            h(Badge, { kind:hint.depth?'ok':'off', key:'d' }, `Depth ${hint.depth?'✓':'×'}`),
            h(Badge, { kind:hint.continuable?'ok':'off', key:'c' }, `Continuable ${hint.continuable?'✓':'×'}`),
          ]),
          hintedProblems.length ? h('div', { className:'dsm-status', 'data-w':true, key:'warn' }, [
            h('div', { key:'text' }, hintedProblems.join('；')),
            h('button', { className:'dsm-btn', key:'fix', onClick:() => setDraft(clearUnsupported(draft)) }, '清理不兼容选项'),
          ]) : null,
        ])

        const identity = draft && h('section', { className:'dsm-sec' }, [
          h('strong', { key:'title' }, '身份与运行'),
          capabilityBox,
          h('div', { className:'dsm-grid', key:'grid' }, [
            h(Field, { label:'ID', key:'id' }, input(draft.id, value => {
              const auto = !draft.toolName || draft.toolName === `sub_${draft.id}`
              patch({ id:value, ...(auto ? { toolName:value ? `sub_${value}` : '' } : {}) })
            }, { disabled:editing !== null, placeholder:'local_worker' })),
            h(Field, { label:'Tool name', key:'tool' }, input(draft.toolName, value => patch({ toolName:value }), { placeholder:'sub_local_worker' })),
            h(Field, { label:'Subagent backend', key:'backend' }, h(React.Fragment, null,
              input(draft.backend, value => patch({ backend:value }), { list:'dsm-backends' }),
              h('datalist', { id:'dsm-backends' }, BACKENDS.map(x => h('option', { key:x, value:x }))))),
            h(Field, { label:'Background mode', key:'bg' }, h('select', {
              className:'dsm-sel', value:draft.backgroundMode,
              onChange:e => patch({ backgroundMode:e.currentTarget.value }),
            }, h('option', { value:'one-shot' }, 'one-shot'), h('option', { value:'continuable' }, 'continuable（可继续）'))),
            h(Field, { label:'Max depth', key:'depth' }, input(draft.maxDepth, value => patch({ maxDepth:value }), { placeholder:'3 / provider-managed' })),
            h(Field, { label:'Max tokens（可选）', key:'tokens' }, input(draft.maxTokens, value => patch({ maxTokens:value }), { type:'number', min:1, placeholder:'继承默认' })),
          ]),
          h('div', { className:'dsm-checks', key:'checks' }, [
            h(Check, { key:'enabled', label:'启用', checked:draft.enabled !== false, onChange:value => patch({ enabled:value }) }),
            h(Check, { key:'bgallow', label:'允许 run_in_background', checked:draft.enableRunInBackground !== false, onChange:value => patch({ enableRunInBackground:value }) }),
            h(Check, { key:'dynamic', label:'动态选模型', checked:draft.dynamicModelSelection === true, onChange:value => patch({ dynamicModelSelection:value }) }),
          ]),
        ])

        const modelSection = draft && h('section', { className:'dsm-sec' }, [
          h('strong', { key:'title' }, '模型路由'),
          h('div', { className:'dsm-actions', key:'quick' }, [
            h('button', { className:'dsm-btn', type:'button', onClick:() => patch({ llmProvider:'', model:'', reasoningEffort:'' }) }, '继承主代理 / backend 默认'),
          ]),
          h('div', { className:'dsm-grid', key:'grid' }, [
            h(Field, { label:'LLM provider（空=继承）', key:'provider' }, h(React.Fragment, null,
              input(draft.llmProvider, value => patch({ llmProvider:value, ...(!value ? { model:'', reasoningEffort:'' } : {}) }), { list:'dsm-providers', placeholder:catalog?.default?.provider ?? '例如 ollama' }),
              h('datalist', { id:'dsm-providers' }, (catalog?.groups ?? []).map(g => h('option', { key:g.id, value:g.id, label:g.name }))))),
            h(Field, { label:'Model（空=继承）', key:'model' }, h(React.Fragment, null,
              input(draft.model, value => patch({ model:value, reasoningEffort:'' }), { list:'dsm-models', placeholder:catalog?.default?.model ?? '模型 ID' }),
              h('datalist', { id:'dsm-models' }, models.map(m => h('option', { key:m.id, value:m.id, label:m.name }))))),
            h(Field, { label:'Reasoning effort', key:'effort' }, h(React.Fragment, null,
              input(draft.reasoningEffort, value => patch({ reasoningEffort:value }), { list:'dsm-efforts', placeholder:route?.reasoning?.defaultEffort ?? '模型默认' }),
              h('datalist', { id:'dsm-efforts' }, efforts.map(e => h('option', { key:e.id, value:e.id, label:e.name }))))),
            h('div', { className:'dsm-note', key:'note' }, catError
              ? `模型目录读取失败：${catError}；仍可手填。`
              : catalog ? `已读取 ${catalog.groups.length} 个 provider；目录外动态模型仍允许手填。` : '正在读取 Harness 模型目录…'),
          ]),
        ])

        const roleSection = draft && h('section', { className:'dsm-sec' }, [
          h('strong', { key:'title' }, '角色与工具'),
          h(Field, { label:'Persona / 岗位职责', wide:true, key:'persona' },
            h('textarea', { className:'dsm-ta', value:draft.persona, onChange:e => patch({ persona:e.currentTarget.value }), placeholder:'负责重复实现、搜索代码和跑测试；架构决策交回主代理。' })),
          h('div', { className:'dsm-grid', key:'tools' }, [
            h(Field, { label:'Tool allowlist（逗号）', key:'allow' }, input(draft.allowTools, value => patch({ allowTools:value }), { placeholder:'read_file, grep' })),
            h(Field, { label:'Tool denylist（逗号）', key:'deny' }, input(draft.denyTools, value => patch({ denyTools:value }), { placeholder:'dangerous_tool' })),
          ]),
        ])

        const conflict = externalConflict && h('div', { className:'dsm-status', 'data-w':true }, [
          h('div', { key:'text' }, '这个子代理在你编辑期间被其他窗口、命令或配置文件修改了。当前草稿没有被覆盖。'),
          h('div', { className:'dsm-conflict', key:'actions' }, [
            h('button', { className:'dsm-btn', onClick:() => {
              const current = profiles[editing]
              if (!current) return
              setDraft(draftOf(current)); setBaseProfile(current); setBaseRevision(snap.revision); setExternalConflict(false)
            } }, '加载外部版本'),
            h('button', { className:'dsm-btn', onClick:() => {
              setBaseProfile(profiles[editing] ?? null); setBaseRevision(snap.revision); setExternalConflict(false)
            } }, '保留我的草稿并重新基于最新版本'),
          ]),
        ])

        const editor = !draft ? h('div', { className:'dsm-empty' }, '选择左侧子代理，或新增一个角色。') : h(React.Fragment, null, [
          h('div', { className:'dsm-head', key:'head' }, [
            h('div', { key:'name' }, h('strong', null, editing ?? '新建子代理'),
              h('div', { className:'dsm-note' }, `${dirty ? '有未保存修改 · ' : ''}revision ${baseRevision ?? snap.revision ?? '-'}`)),
            h('div', { className:'dsm-actions', key:'actions' }, [
              editing ? h('button', { className:'dsm-btn', key:'clone', onClick:clone }, '复制') : null,
              editing ? h('button', { className:'dsm-btn', 'data-d':true, key:'delete', disabled:busy || !writable, onClick:() => remove(editing) }, '删除') : null,
              h('button', { className:'dsm-btn', 'data-p':true, key:'save', disabled:busy || !writable || externalConflict, onClick:save }, busy ? '保存中…' : '保存'),
            ]),
          ]),
          conflict,
          status ? h('div', { className:'dsm-status', 'data-e':status.e || undefined, key:'status' }, status.t) : null,
          identity, modelSection, roleSection,
        ])

        return h('div', { className:'dsm' }, [
          h('aside', { className:'dsm-side', key:'side' }, [
            h('div', { className:'dsm-head', key:'head' }, [
              h('div', null, h('strong', null, '子代理'), h('div', { className:'dsm-note' }, `${ids.length} 个角色`)),
              h('button', { className:'dsm-btn', 'data-p':true, disabled:!writable, onClick:create }, '新增'),
            ]),
            input(query, setQuery, { className:'dsm-in dsm-search', placeholder:'搜索 ID / backend / model / persona' }),
            h('div', { className:'dsm-list', key:'list' }, filteredIds.map(id => {
              const profile = profiles[id]
              return h('button', { className:'dsm-item', 'data-on':selected === id, key:id, onClick:() => choose(id) }, [
                h('div', { className:'dsm-row', key:'top' }, [
                  h('strong', { key:'id' }, id),
                  h(Badge, { kind:profile.enabled ? 'ok' : 'off', key:'state' }, profile.enabled ? '启用' : '停用'),
                ]),
                h('span', { className:'dsm-note', key:'route' }, `${profile.backend} · ${profile.llmProvider ? `${profile.llmProvider}/${profile.model}` : 'inherit'}`),
                h('span', { className:'dsm-note', key:'tool' }, profile.toolName),
                h('div', { className:'dsm-actions', key:'quick' }, [
                  h('span', { className:'dsm-note', key:'label' }, profile.enabled ? '运行' : '已停用'),
                  h('input', { key:'toggle', type:'checkbox', checked:profile.enabled !== false, disabled:busy || !writable, onClick:e => e.stopPropagation(), onChange:e => toggle(id, e.currentTarget.checked) }),
                ]),
              ])
            })),
          ]),
          h('main', { className:'dsm-main', key:'main' }, editor),
        ])
      }

      const inject = ['slots', 'settingsScope', 'remote', 'remote.session']
      function apply(ctx) {
        const scope = ctx.settingsScope.bind({ namespace:'subagent-mgr', decode:value => value && typeof value === 'object' && !Array.isArray(value) && value.profiles && typeof value.profiles === 'object' ? value : undefined })
        const loadCatalog = React.useCallback
          ? () => ctx.remote.session.modelCatalog().then(response => {
              if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
              return response.value
            })
          : () => Promise.resolve(null)
        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name:'settings.plugins.tab',
          id:'subagents',
          order:20,
          label:'子代理',
          inject:() => ({ scope, loadCatalog }),
        }, Manager))
      }
      return { inject, apply }
    },
  })
})()
