from pathlib import Path
p=Path(__file__).with_name('index.html');s=p.read_text(encoding='utf-8')
start=s.index('<script>');end=s.index('</script>',start)
s=s[:start]+'<script src="/editor.js"></script><script src="/app.js"></script>'+s[end+9:]
s=s.replace('<div id="prompt-field"', '''<div id="identity-options" hidden>
<div class="field"><label for="traits">重要人物特征 · 可选</label><textarea id="traits" maxlength="2000" style="min-height:78px" placeholder="例如：圆脸、左眼下有痣、黑色齐肩发…"></textarea></div>
<div class="field"><label for="preserve">保留范围</label><select id="preserve"><option value="face">脸部身份</option><option value="hair" selected>脸部和发型</option><option value="appearance">整体外观</option></select></div></div>
<div class="field" id="region-field"><button type="button" class="secondary" id="region-open" hidden>框选身份区域</button><div class="help" id="region-state"></div></div>
<div id="local-options" hidden><div class="field"><label class="checkline"><input id="local-edit" type="checkbox">仅修改涂抹区域</label><div class="help">选区外保持原图；取消勾选则编辑整张图。</div></div><div class="field"><label for="feather">选区边缘羽化 <span id="feather-value">8 px</span></label><input type="range" id="feather" min="0" max="32" value="8"></div></div>
<div id="prompt-field"''')
s=s.replace('<div class="preview" id="preview">','''<div id="editor-tools" hidden><span id="editor-caption"></span><div class="region-actions"><span id="brush-controls"><button type="button" class="secondary active" id="paint">画笔</button><button type="button" class="secondary" id="erase">橡皮</button><label>大小 <input id="brush-size" type="range" min="4" max="160" value="40"><span id="brush-value">40</span></label></span><button type="button" class="secondary" id="undo-region">撤销</button><button type="button" class="secondary" id="clear-region">清空</button><button type="button" class="secondary" id="editor-done">完成标记</button></div></div><div class="preview" id="editor-stage" hidden><canvas id="region-canvas" aria-label="参考图标记画布"></canvas></div><div class="preview" id="preview">''')
css='''
.checkline{display:flex;gap:9px;align-items:center}.checkline input{width:auto;accent-color:var(--accent)}input[type=range]{accent-color:var(--accent);padding:0}#region-canvas{max-width:100%;max-height:calc(100vh - 405px);width:auto;height:auto;touch-action:none;cursor:crosshair;object-fit:contain}#editor-stage{position:relative;min-height:350px}#editor-tools{padding:6px 0 12px;font-size:11px;color:#adbcb9}.region-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:9px}#brush-controls{display:flex;align-items:center;gap:6px}#brush-controls label{display:flex;align-items:center;gap:7px;margin:0 5px;font-size:11px}#brush-size{width:65px}#editor-tools .secondary{padding:6px 9px;font-size:11px}#editor-tools .active{color:var(--accent);border-color:#659585}#region-open{width:100%;padding:10px}#region-state:empty{display:none}#feather-value{float:right;color:var(--muted)}
'''
s=s.replace('</style>',css+'</style>')
p.write_text(s,encoding='utf-8')
