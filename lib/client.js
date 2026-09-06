(() => {
  const ID = 'dsh-subagent-mgr'
  window.__ModuleLoader__.load({
    id: ID,
    factory(require) {
      const React = require('react')
      const h = React.createElement
      const css = `.dsm{display:grid;grid-template-columns:260px 1fr;gap:16px;min-height:450px}.dsm *{box-sizing:border-box}.dsm-side,.dsm-main{border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:12px;padding:14px}.dsm-head,.dsm-row,.dsm-actions{display:flex;align-items:center;gap:8px}.dsm-head{justify-content:space-between;margin-bottom:10px}.dsm-list{display:grid;gap:6px}.dsm-item,.dsm-btn{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;background:transparent;color:inherit;cursor:pointer}.dsm-item{padding:9px;text-align:left}.dsm-item[data-on=true]{border-color:#4d6bfe;background:color-mix(in srgb,#4d6bfe 10%,transparent)}.dsm-btn{padding:7px 10px}.dsm-btn[data-p=true]{background:#4d6bfe;border-color:#4d6bfe;color:white}.dsm-btn[data-d=true]{color:#e95d67}.dsm-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.dsm-field{display:grid;gap:5px;font-size:12px}.dsm-wide{grid-column:1/-1}.dsm-in,.dsm-sel,.dsm-ta{width:100%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;padding:8px}.dsm-ta{min-height:88px;resize:vertical}.dsm-sec{display:grid;gap:10px;margin:14px 0}.dsm-sec>strong{font-size:12px;opacity:.68}.dsm-note{font-size:12px;opacity:.65}.dsm-status{margin:10px 0;padding:8px;border-radius:8px;background:color-mix(in srgb,#4d6bfe 10%,transparent)}.dsm-status[data-e=true]{color:#ff9aa2;background:color-mix(in srgb,#e95d67 12%,transparent)}.dsm-checks{display:flex;gap:14px;flex-wrap:wrap}.dsm-empty{padding:40px;text-align:center;opacity:.65}@media(max-width:820px){.dsm{grid-template-columns:1fr}.dsm-grid{grid-template-columns:1fr}.dsm-wide{grid-column:auto}}`
      if (typeof document !== 'undefined' && !document.querySelector(`style[data-plugin-css="${ID}"]`)) {
        const s = document.createElement('style'); s.dataset.plugin = ID; s.dataset.pluginCss = ID; s.textContent = css; document.head.appendChild(s)
      }
      const ID_RE = /^[a-z][a-z0-9_-]{0,47}$/
      const TOOL_RE = /^[a-z][a-z0-9_-]{0,63}$/
      const backends = ['spawn','fork','dsh-sdk','codex','claude-code','acp']
      const list = v => [...new Set(String(v || '').split(',').map(x => x.trim()).filter(Boolean))]
      const blank = (id='') => ({id,enabled:true,backend:'spawn',toolName:id?`sub_${id}`:'',llmProvider:'',model:'',reasoningEffort:'',maxTokens:'',dynamicModelSelection:false,enableRunInBackground:true,backgroundMode:'one-shot',persona:'',allowTools:'',denyTools:'',maxDepth:'3'})
      const draftOf = p => ({...blank(p.id),...p,llmProvider:p.llmProvider??'',model:p.model??'',reasoningEffort:p.reasoningEffort??'',maxTokens:p.maxTokens??'',persona:p.persona??'',allowTools:Array.isArray(p.allowTools)?p.allowTools.join(', '):'',denyTools:Array.isArray(p.denyTools)?p.denyTools.join(', '):'',maxDepth:String(p.maxDepth??3)})
      const storedOf = d => {
        const p={id:d.id.trim(),enabled:d.enabled!==false,backend:d.backend.trim()||'spawn',toolName:d.toolName.trim(),dynamicModelSelection:d.dynamicModelSelection===true,enableRunInBackground:d.enableRunInBackground!==false,backgroundMode:d.backgroundMode||'one-shot',maxDepth:d.maxDepth==='provider-managed'?'provider-managed':Number(d.maxDepth)}
        if(d.llmProvider.trim())p.llmProvider=d.llmProvider.trim(); if(d.model.trim())p.model=d.model.trim(); if(d.reasoningEffort.trim())p.reasoningEffort=d.reasoningEffort.trim(); if(String(d.maxTokens).trim())p.maxTokens=Number(d.maxTokens); if(d.persona.trim())p.persona=d.persona.trim()
        const a=list(d.allowTools),n=list(d.denyTools); if(a.length)p.allowTools=a;if(n.length)p.denyTools=n;return p
      }
      function validate(d, profiles, editing) {
        if(!ID_RE.test(d.id.trim()))return 'ID 格式不正确（小写字母开头，可含数字、_、-，最长 48）。'
        if(!d.backend.trim())return 'Backend 不能为空。'; if(!TOOL_RE.test(d.toolName.trim()))return 'Tool name 格式不正确。'
        if((!d.llmProvider.trim())!==(!d.model.trim()))return 'Provider 和 Model 必须同时填写，或同时留空继承主代理。'
        if(String(d.maxTokens).trim()&&(!Number.isSafeInteger(Number(d.maxTokens))||Number(d.maxTokens)<1))return 'Max tokens 必须是正整数。'
        if(d.maxDepth!=='provider-managed'&&(!Number.isSafeInteger(Number(d.maxDepth))||Number(d.maxDepth)<0))return 'Max depth 必须是非负整数或 provider-managed。'
        const overlap=list(d.allowTools).filter(x=>list(d.denyTools).includes(x));if(overlap.length)return `allow/deny 冲突：${overlap.join(', ')}`
        if(editing!==d.id.trim()&&profiles[d.id.trim()])return `子代理 ${d.id.trim()} 已存在。`
        for(const [id,p] of Object.entries(profiles))if(id!==editing&&p.toolName===d.toolName.trim())return `Tool name 已被 ${id} 使用。`;return null
      }
      const decode = v => v && typeof v==='object' && !Array.isArray(v) && v.profiles && typeof v.profiles==='object' && !Array.isArray(v.profiles) ? v : undefined
      function useScope(scope){return React.useSyncExternalStore(React.useCallback(fn=>scope.subscribe(fn),[scope]),React.useCallback(()=>scope.getSnapshot(),[scope]),React.useCallback(()=>scope.getSnapshot(),[scope]))}
      const Field=({label,wide,children})=>h('label',{className:`dsm-field${wide?' dsm-wide':''}`},h('span',null,label),children)
      const Check=({label,checked,onChange})=>h('label',{className:'dsm-row',style:{fontSize:12}},h('input',{type:'checkbox',checked,onChange:e=>onChange(e.currentTarget.checked)}),label)
      function Manager({scope,loadCatalog}){
        const snap=useScope(scope), profiles=snap.value?.profiles??{}, ids=Object.keys(profiles).sort()
        const [selected,setSelected]=React.useState(null),[editing,setEditing]=React.useState(null),[draft,setDraft]=React.useState(null),[catalog,setCatalog]=React.useState(null),[catError,setCatError]=React.useState(null),[busy,setBusy]=React.useState(false),[status,setStatus]=React.useState(null)
        React.useEffect(()=>{let live=true;loadCatalog().then(v=>live&&setCatalog(v),e=>live&&setCatError(String(e?.message??e)));return()=>{live=false}},[loadCatalog])
        React.useEffect(()=>{if(selected&&profiles[selected]){setEditing(selected);setDraft(draftOf(profiles[selected]))}else if(selected){setSelected(null);setEditing(null);setDraft(null)}},[selected,profiles])
        if(snap.status==='loading')return h('div',{className:'dsm-note'},'正在读取子代理配置…')
        if(snap.status!=='ready')return h('div',{className:'dsm-empty'},'当前 Web 页面没有可写的 Harness settings 通道；请从本机 Web 打开，或使用 /subagents。')
        const writable=snap.writable===true, patch=x=>setDraft(d=>d?{...d,...x}:d),group=catalog?.groups?.find(g=>g.id===draft?.llmProvider),models=group?.models??[],route=models.find(m=>m.id===draft?.model),efforts=route?.reasoning?.efforts??[]
        const persist=async next=>{setBusy(true);try{await scope.set('profiles',next)}finally{setBusy(false)}}
        const save=async()=>{if(!draft)return;const err=validate(draft,profiles,editing);if(err){setStatus({e:true,t:err});return}const p=storedOf(draft),next=structuredClone(profiles);if(editing&&editing!==p.id)delete next[editing];next[p.id]=p;try{await persist(next);const accepted=scope.getSnapshot().value?.profiles?.[p.id];if(!accepted)throw new Error('Harness 没有接受这次写入。');setSelected(p.id);setEditing(p.id);setDraft(draftOf(accepted));setStatus({e:false,t:'已保存并热更新。'})}catch(e){setStatus({e:true,t:String(e?.message??e)})}}
        const remove=async id=>{if(!writable||busy)return;if(typeof window!=='undefined'&&!window.confirm(`删除子代理 ${id}？`))return;const next=structuredClone(profiles);delete next[id];try{await persist(next);setSelected(null);setEditing(null);setDraft(null)}catch(e){setStatus({e:true,t:String(e?.message??e)})}}
        const toggle=async(id,on)=>{const next=structuredClone(profiles);next[id]={...next[id],enabled:on};await persist(next)}
        const clone=()=>{if(!draft)return;let i=1,id;do{id=`${draft.id.slice(0,40)}${i===1?'_copy':`_copy${i}`}`;i++}while(profiles[id]);setSelected(null);setEditing(null);setDraft({...draft,id,toolName:`sub_${id}`})}
        const input=(value,onChange,extra={})=>h('input',{className:'dsm-in',value,onChange:e=>onChange(e.currentTarget.value),...extra})
        const identity = draft && h('section',{className:'dsm-sec'},[
          h('strong',{key:'title'},'身份与运行'),
          h('div',{className:'dsm-grid',key:'grid'},[
            h(Field,{label:'ID',key:'id'},input(draft.id,v=>{const auto=!draft.toolName||draft.toolName===`sub_${draft.id}`;patch({id:v,...(auto?{toolName:v?`sub_${v}`:''}:{})})},{disabled:editing!==null,placeholder:'local_worker'})),
            h(Field,{label:'Tool name',key:'tool'},input(draft.toolName,v=>patch({toolName:v}),{placeholder:'sub_local_worker'})),
            h(Field,{label:'Subagent backend',key:'backend'},h(React.Fragment,null,input(draft.backend,v=>patch({backend:v}),{list:'dsm-backends'}),h('datalist',{id:'dsm-backends'},backends.map(x=>h('option',{key:x,value:x}))))),
            h(Field,{label:'Background mode',key:'bg'},h('select',{className:'dsm-sel',value:draft.backgroundMode,onChange:e=>patch({backgroundMode:e.currentTarget.value})},h('option',{value:'one-shot'},'one-shot'),h('option',{value:'continuable'},'continuable（可继续）'))),
            h(Field,{label:'Max depth',key:'depth'},input(draft.maxDepth,v=>patch({maxDepth:v}),{placeholder:'3 / provider-managed'})),
            h(Field,{label:'Max tokens（可选）',key:'tokens'},input(draft.maxTokens,v=>patch({maxTokens:v}),{type:'number',min:1,placeholder:'继承默认'})),
          ]),
          h('div',{className:'dsm-checks',key:'checks'},[
            h(Check,{key:'enabled',label:'启用',checked:draft.enabled!==false,onChange:v=>patch({enabled:v})}),
            h(Check,{key:'bgallow',label:'允许 run_in_background',checked:draft.enableRunInBackground!==false,onChange:v=>patch({enableRunInBackground:v})}),
            h(Check,{key:'dynamic',label:'动态选模型',checked:draft.dynamicModelSelection===true,onChange:v=>patch({dynamicModelSelection:v})}),
          ]),
        ])
        const modelSection = draft && h('section',{className:'dsm-sec'},[
          h('strong',{key:'title'},'模型路由'),
          h('div',{className:'dsm-grid',key:'grid'},[
            h(Field,{label:'LLM provider（空=继承）',key:'provider'},h(React.Fragment,null,
              input(draft.llmProvider,v=>patch({llmProvider:v,...(!v?{model:'',reasoningEffort:''}:{})}),{list:'dsm-providers',placeholder:catalog?.default?.provider??'例如 ollama'}),
              h('datalist',{id:'dsm-providers'},(catalog?.groups??[]).map(g=>h('option',{key:g.id,value:g.id,label:g.name}))))),
            h(Field,{label:'Model（空=继承）',key:'model'},h(React.Fragment,null,
              input(draft.model,v=>patch({model:v,reasoningEffort:''}),{list:'dsm-models',placeholder:catalog?.default?.model??'模型 ID'}),
              h('datalist',{id:'dsm-models'},models.map(m=>h('option',{key:m.id,value:m.id,label:m.name}))))),
            h(Field,{label:'Reasoning effort',key:'effort'},h(React.Fragment,null,
              input(draft.reasoningEffort,v=>patch({reasoningEffort:v}),{list:'dsm-efforts',placeholder:route?.reasoning?.defaultEffort??'模型默认'}),
              h('datalist',{id:'dsm-efforts'},efforts.map(e=>h('option',{key:e.id,value:e.id,label:e.name}))))),
            h('div',{className:'dsm-note',key:'note'},catError?`模型目录读取失败：${catError}；仍可手填。`:catalog?`已读取 ${catalog.groups.length} 个 provider；可手填自定义路由。`:'正在读取 Harness 模型目录…'),
          ]),
        ])
        const roleSection = draft && h('section',{className:'dsm-sec'},[
          h('strong',{key:'title'},'角色与工具'),
          h(Field,{label:'Persona / 岗位职责',wide:true,key:'persona'},h('textarea',{className:'dsm-ta',value:draft.persona,onChange:e=>patch({persona:e.currentTarget.value}),placeholder:'负责重复实现、搜索代码和跑测试；架构决策交回主代理。'})),
          h('div',{className:'dsm-grid',key:'tools'},[
            h(Field,{label:'Tool allowlist（逗号）',key:'allow'},input(draft.allowTools,v=>patch({allowTools:v}),{placeholder:'read_file, grep'})),
            h(Field,{label:'Tool denylist（逗号）',key:'deny'},input(draft.denyTools,v=>patch({denyTools:v}),{placeholder:'dangerous_tool'})),
          ]),
        ])
        const editor = !draft ? h('div',{className:'dsm-empty'},'选择左侧子代理，或新增一个角色。') : h(React.Fragment,null,[
          h('div',{className:'dsm-head',key:'head'},[
            h('div',{key:'name'},h('strong',null,editing??'新建子代理'),h('div',{className:'dsm-note'},editing?`Tool: ${draft.toolName}`:'保存后立即挂载官方 dsh-tool-subagent。')),
            h('div',{className:'dsm-actions',key:'actions'},[
              editing?h('button',{className:'dsm-btn',key:'clone',onClick:clone},'复制'):null,
              editing?h('button',{className:'dsm-btn','data-d':true,key:'delete',disabled:busy||!writable,onClick:()=>remove(editing)},'删除'):null,
              h('button',{className:'dsm-btn','data-p':true,key:'save',disabled:busy||!writable,onClick:save},busy?'保存中…':'保存'),
            ]),
          ]),
          status?h('div',{className:'dsm-status','data-e':status.e,key:'status'},status.t):null,
          identity,
          modelSection,
          roleSection,
          editing?h('div',{className:'dsm-row',key:'toggle'},[
            h('button',{className:'dsm-btn',key:'button',disabled:busy||!writable,onClick:()=>toggle(editing,draft.enabled===false)},draft.enabled===false?'立即启用':'立即停用'),
            h('span',{className:'dsm-note',key:'note'},'立即挂载/卸载对应的官方 subagent tool fiber。'),
          ]):null,
        ])
        const roster = ids.length ? ids.map(id=>{const p=profiles[id],route=p.llmProvider?`${p.llmProvider}/${p.model}`:'继承主代理';return h('button',{key:id,className:'dsm-item','data-on':selected===id,onClick:()=>setSelected(id)},[
          h('div',{className:'dsm-head',style:{margin:0},key:'head'},h('strong',null,`${p.enabled===false?'○':'●'} ${id}`),h('span',{className:'dsm-note'},p.backend??'spawn')),
          h('div',{className:'dsm-note',key:'route'},route),
        ])}) : h('div',{className:'dsm-note'},'还没有子代理。')
        return h('div',{className:'dsm'},[
          h('aside',{className:'dsm-side',key:'side'},[
            h('div',{className:'dsm-head',key:'head'},h('strong',null,'子代理 / Subagents'),h('button',{className:'dsm-btn','data-p':true,disabled:!writable||busy,onClick:()=>{setSelected(null);setEditing(null);setDraft(blank());setStatus(null)}},'+ 新增')),
            h('div',{className:'dsm-list',key:'list'},roster),
          ]),
          h('main',{className:'dsm-main',key:'main'},editor),
        ])
      }
      const inject=['slots','settingsScope','remote','remote.session']
      function apply(ctx){const scope=ctx.settingsScope.bind({namespace:'subagent-mgr',decode});const loadCatalog=async()=>{const r=await ctx.remote.session.modelCatalog();if(!r.ok)throw new Error(`${r.error.code}: ${r.error.message}`);return r.value};ctx.slots.inject('settings.plugins.tab',()=>ctx.slots.register({name:'settings.plugins.tab',id:'subagents',order:20,label:'子代理',inject:()=>({scope,loadCatalog})},Manager))}
      return {inject,apply}
    }
  })
})()
