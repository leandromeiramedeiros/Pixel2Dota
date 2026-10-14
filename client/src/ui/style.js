// HUD stylesheet. Sizes are written in "u" (one art pixel at HUD scale): `12u` -> calc(12 * var(--u)), --u = integer CSS px.
export const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Press+Start+2P&display=swap';

const CSS = `
.h-root { --gold:#d4a73c; --gold2:#8a6b25; --bg0:#0b0e14; --bg1:#151a26; --bg2:#1f2738; --ink:#05070b; --txt:#dfe4f0; --dim:#8e99b3;
  --hp:#47c457; --hp2:#1f6b2c; --mp:#4a86ee; --mp2:#1f438f; --xp:#b36ae8; --rad:#58d96c; --dire:#ee5a4a; --warn:#ff6b5b;
  position:absolute; inset:0; overflow:hidden; pointer-events:none; color:var(--txt); font-family:'Silkscreen','Courier New',monospace; font-size:8u; line-height:1.15;
  user-select:none; -webkit-user-select:none; text-transform:none; letter-spacing:0; }
.h-root * { box-sizing:border-box; }
.h-root canvas.px { image-rendering:pixelated; display:block; }
.h-num { font-family:'Press Start 2P','Silkscreen',monospace; font-size:6u; }
.h-panel { pointer-events:auto; background:linear-gradient(#1a2030,#10141e); box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold2), inset 0 0 0 2u #0a0d14; }
.h-dim { color:var(--dim); } .h-gold { color:var(--gold); } .h-warn { color:var(--warn); }

/* ---------- top bar ---------- */
.h-top { position:absolute; top:3u; left:50%; transform:translateX(-50%); display:flex; align-items:flex-start; gap:2u; }
.h-team { display:flex; gap:1u; }
.h-hero { position:relative; width:24u; height:34u; background:#0c1018; box-shadow:0 0 0 1u var(--ink); pointer-events:auto; overflow:hidden; }
.h-hero .h-pt { position:absolute; left:0; top:0; width:24u; height:24u; overflow:hidden; }
.h-hero .h-hpm { position:absolute; left:1u; right:1u; top:25u; height:3u; background:#0a2410; box-shadow:0 0 0 1u var(--ink); }
.h-hero .h-hpm i { display:block; height:100%; background:var(--hp); }
.h-hero .h-mpm { position:absolute; left:1u; right:1u; top:29u; height:2u; background:#0f1c3d; box-shadow:0 0 0 1u var(--ink); }
.h-hero .h-mpm i { display:block; height:100%; background:var(--mp); }
.h-hero .h-lv { position:absolute; right:1u; top:1u; background:rgba(5,7,11,.8); padding:1u 1u 0; font-size:6u; color:#fff; }
.h-hero.me { box-shadow:0 0 0 1u var(--gold); }
.h-hero.rad::after { content:''; position:absolute; left:0; right:0; bottom:0; height:1u; background:var(--rad); }
.h-hero.dire::after { content:''; position:absolute; left:0; right:0; bottom:0; height:1u; background:var(--dire); }
.h-hero .h-dead { position:absolute; left:0; top:0; width:24u; height:24u; background:rgba(5,7,11,.72); display:none; align-items:center; justify-content:center; font-family:'Press Start 2P',monospace; font-size:8u; color:#fff; }
.h-hero.dead .h-dead { display:flex; } .h-hero.dead .h-pt { filter:grayscale(1) brightness(.6); }
.h-hero.disc { opacity:.45; }
.h-mid { display:flex; align-items:stretch; height:20u; padding:0; }
.h-score { width:30u; display:flex; align-items:center; justify-content:center; font-family:'Press Start 2P',monospace; font-size:9u; }
.h-score.rad { color:var(--rad); background:linear-gradient(#10281a,#0a1810); } .h-score.dire { color:var(--dire); background:linear-gradient(#2c1210,#1a0b0a); }
.h-clk { width:52u; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1u; background:linear-gradient(#1a2030,#0d1119); }
.h-clk b { font-family:'Press Start 2P',monospace; font-size:8u; font-weight:400; color:#fff; }
.h-clk .h-dn { height:9u; display:flex; align-items:center; }

/* ---------- bottom bar ---------- */
.h-bottom { position:absolute; bottom:0; left:50%; transform:translateX(-50%); display:flex; align-items:flex-end; gap:2u; padding-bottom:2u; }
.h-stats { width:60u; height:56u; padding:3u 4u; font-size:7u; display:flex; flex-direction:column; justify-content:space-between; }
.h-stats .r { display:flex; align-items:center; justify-content:space-between; gap:2u; }
.h-stats .r canvas { margin-right:1u; }
.h-stats .l { display:flex; align-items:center; gap:1u; color:var(--dim); }
.h-stats .v { font-family:'Press Start 2P',monospace; font-size:5u; color:#fff; white-space:nowrap; }
.h-stats .l { white-space:nowrap; }
.h-stats .sep { height:1u; background:#2a3248; margin:1u 0; }
.h-stats .r.pri .v { color:var(--gold); }
.h-stats .b { color:#7fe08f; }
.h-port { width:44u; height:56u; padding:3u; position:relative; }
.h-port .h-pimg { position:absolute; left:3u; top:3u; width:38u; height:44u; background:#0a0d14; overflow:hidden; display:flex; justify-content:center; }
.h-port.dead .h-pimg canvas { filter:grayscale(1) brightness(.55); }
.h-port .h-plv { position:absolute; left:3u; top:3u; min-width:11u; height:10u; padding:2u 2u 0; background:rgba(5,7,11,.85); box-shadow:inset 0 0 0 1u var(--gold2); font-family:'Press Start 2P',monospace; font-size:6u; text-align:center; color:#fff; }
.h-port .h-xp { position:absolute; left:3u; right:3u; bottom:3u; height:4u; background:#1d1230; box-shadow:0 0 0 1u var(--ink); }
.h-port .h-xp i { display:block; height:100%; background:var(--xp); }
.h-port .h-resp { position:absolute; left:3u; top:3u; width:38u; height:44u; display:none; align-items:center; justify-content:center; background:rgba(5,7,11,.6); font-family:'Press Start 2P',monospace; font-size:12u; color:#fff; }
.h-port.dead .h-resp { display:flex; }
.h-main { min-width:132u; display:flex; flex-direction:column; align-items:stretch; gap:2u; }
.h-buffs { display:flex; gap:1u; height:11u; align-items:flex-end; min-width:20u; padding-left:1u; }
.h-buff { position:relative; width:11u; height:11u; box-shadow:0 0 0 1u var(--ink); background:#10141e; pointer-events:auto; display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:5u; color:#fff; }
.h-buff.bad { box-shadow:0 0 0 1u var(--warn); }
.h-buff canvas { width:calc(11 * var(--u)); height:calc(11 * var(--u)); }
.h-abil { display:flex; gap:2u; padding:3u 3u 2u; align-items:flex-end; justify-content:center; }
.h-orbs { margin-left:auto; display:flex; gap:2u; align-items:center; height:10u; padding-right:2u; }
.h-orb { width:8u; height:8u; box-shadow:0 0 0 1u var(--ink); border-radius:0; position:relative; }
.h-orb::after { content:''; position:absolute; left:1u; top:1u; width:2u; height:2u; background:rgba(255,255,255,.6); }
.h-orb.q { background:#4aaeff; } .h-orb.w { background:#b45cff; } .h-orb.e { background:#ffa23a; } .h-orb.n { background:#232a3a; }
.h-slot { position:relative; display:flex; flex-direction:column; align-items:center; gap:1u; }
.h-ico { position:relative; width:24u; height:24u; background:#0a0d14; box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u #2d3650; padding:2u; pointer-events:auto; cursor:pointer; }
.h-ico canvas { width:calc(20 * var(--u)); height:calc(20 * var(--u)); }
.h-ico.off canvas { filter:grayscale(1) brightness(.5); }
.h-ico.nomana::before { content:''; position:absolute; inset:2u; background:rgba(40,70,200,.5); z-index:2; }
.h-ico.active { box-shadow:0 0 0 1u var(--gold), inset 0 0 0 1u var(--gold); }
.h-ico.passive { cursor:default; }
.h-ico .h-sweep { position:absolute; inset:2u; background:conic-gradient(rgba(0,0,0,.72) var(--a,0deg), transparent 0); z-index:3; display:none; }
.h-ico .h-cdt { position:absolute; inset:2u; z-index:4; display:none; align-items:center; justify-content:center; font-family:'Press Start 2P',monospace; font-size:8u; color:#fff; text-shadow:1u 1u 0 #000, -1u 0 0 #000, 0 -1u 0 #000; }
.h-ico.cd .h-sweep, .h-ico.cd .h-cdt { display:flex; }
.h-ico .h-key { position:absolute; left:-1u; top:-1u; z-index:5; min-width:7u; height:8u; padding:1u 1u 0; background:var(--ink); color:var(--gold); font-size:6u; text-align:center; font-family:'Press Start 2P',monospace; }
.h-ico .h-mc { position:absolute; right:2u; bottom:2u; z-index:5; padding:1u 1u 0; background:rgba(5,7,30,.85); color:#8fb4ff; font-family:'Press Start 2P',monospace; font-size:5u; display:none; }
.h-ico .h-ch { position:absolute; right:2u; bottom:2u; z-index:5; padding:1u 1u 0; background:rgba(5,7,11,.85); color:#fff; font-family:'Press Start 2P',monospace; font-size:6u; display:none; }
.h-pips { display:flex; gap:1u; height:3u; align-items:center; justify-content:center; }
.h-pip { width:2u; height:2u; background:#2a3045; box-shadow:0 0 0 0.5u var(--ink); } .h-pip.on { background:var(--gold); }
.h-learn { position:absolute; left:50%; top:-10u; transform:translateX(-50%); width:11u; height:9u; z-index:7; display:none; align-items:center; justify-content:center; background:#2b8a3a; box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u #6fe08a; color:#fff; font-family:'Press Start 2P',monospace; font-size:8u; cursor:pointer; pointer-events:auto; animation:h-blink 0.9s steps(2) infinite; }
.h-learn.on { display:flex; } .h-learn:hover { background:#3cb44f; }
@keyframes h-blink { 50% { filter:brightness(1.45); } }
.h-bars { padding:3u; display:flex; flex-direction:column; gap:1u; }
.h-bar { position:relative; height:10u; background:#0a0d14; box-shadow:0 0 0 1u var(--ink); }
.h-bar > i { position:absolute; left:0; top:0; bottom:0; width:100%; }
.h-bar.hp > i { background:linear-gradient(#5fe070,var(--hp) 40%,var(--hp2)); } .h-bar.hp { background:#10301a; }
.h-bar.mp > i { background:linear-gradient(#7ba6ff,var(--mp) 40%,var(--mp2)); } .h-bar.mp { background:#101e40; height:8u; }
.h-bar span { position:absolute; left:0; right:0; top:0; bottom:0; display:flex; align-items:center; justify-content:center; font-family:'Press Start 2P',monospace; font-size:6u; color:#fff; text-shadow:1u 1u 0 rgba(0,0,0,.9); }
.h-bar em { position:absolute; right:2u; top:0; bottom:0; display:flex; align-items:center; font-style:normal; font-family:'Press Start 2P',monospace; font-size:5u; color:rgba(255,255,255,.85); text-shadow:1u 1u 0 rgba(0,0,0,.9); }
.h-invwrap { display:flex; flex-direction:column; gap:2u; }
.h-inv { padding:3u; display:grid; grid-template-columns:repeat(3,22u); gap:2u; }
.h-is { position:relative; width:22u; height:22u; background:#0a0d14; box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u #2d3650; padding:1u; pointer-events:auto; cursor:pointer; }
.h-is canvas { width:calc(20 * var(--u)); height:calc(20 * var(--u)); }
.h-is.over { box-shadow:0 0 0 1u var(--gold), inset 0 0 0 1u var(--gold); }
.h-is.active { box-shadow:0 0 0 1u var(--gold), inset 0 0 0 1u var(--gold); }
.h-is .h-sweep { position:absolute; inset:1u; background:conic-gradient(rgba(0,0,0,.72) var(--a,0deg), transparent 0); display:none; z-index:3; }
.h-is .h-cdt { position:absolute; inset:1u; z-index:4; display:none; align-items:center; justify-content:center; font-family:'Press Start 2P',monospace; font-size:7u; color:#fff; text-shadow:1u 1u 0 #000; }
.h-is.cd .h-sweep, .h-is.cd .h-cdt { display:flex; }
.h-is .h-key { position:absolute; left:0; top:0; z-index:5; min-width:6u; height:7u; padding:1u 1u 0; background:rgba(5,7,11,.85); color:var(--gold2); font-size:5u; font-family:'Press Start 2P',monospace; }
.h-is .h-ch { position:absolute; right:1u; bottom:1u; z-index:5; padding:1u 1u 0; background:rgba(5,7,11,.85); color:#fff; font-family:'Press Start 2P',monospace; font-size:6u; display:none; }
.h-goldrow { position:relative; display:flex; align-items:center; gap:3u; padding:2u 4u; height:12u; font-family:'Press Start 2P',monospace; font-size:7u; color:var(--gold); }
.h-goldrow.flash { animation:h-blink 0.3s steps(2) 2; }
.h-goldpop { position:absolute; right:4u; top:-2u; color:#ffe27a; font-family:'Press Start 2P',monospace; font-size:7u; text-shadow:1u 1u 0 #000; animation:h-pop 1.1s steps(8) forwards; pointer-events:none; }
@keyframes h-pop { from { transform:translateY(0); opacity:1; } to { transform:translateY(-14u); opacity:0; } }
.h-shopbtn { pointer-events:auto; cursor:pointer; padding:2u 3u; height:12u; display:flex; align-items:center; justify-content:center; color:var(--txt); font-size:7u; }
.h-shopbtn:hover { color:var(--gold); }
.h-tgtbar { position:absolute; left:50%; bottom:76u; transform:translateX(-50%); padding:2u 6u; background:rgba(5,7,11,.8); box-shadow:0 0 0 1u var(--gold2); color:var(--gold); font-size:8u; display:none; }

/* ---------- minimap ---------- */
.h-mm { position:absolute; left:2u; bottom:2u; padding:3u; pointer-events:auto; }
.h-mm .h-mmw { position:relative; background:#000; }
.h-mm canvas { position:absolute; left:0; top:0; }
.h-mm .h-mmcap { position:absolute; left:0; bottom:100%; margin-bottom:2u; display:none; }

/* ---------- tooltip ---------- */
.h-tip { position:fixed; z-index:50; pointer-events:none; width:170u; padding:4u 5u; background:#0d1119; box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold2); display:none; }
.h-tip h4 { margin:0 0 2u; font-size:9u; color:var(--gold); font-weight:700; }
.h-tip .sub { color:var(--dim); margin-bottom:3u; }
.h-tip .row { display:flex; flex-wrap:wrap; justify-content:space-between; gap:0 4u; margin:1u 0; }
.h-tip .row > span:first-child { white-space:nowrap; }
.h-tip .row b { margin-left:auto; font-weight:400; color:#fff; font-family:'Press Start 2P',monospace; font-size:6u; white-space:nowrap; }
.h-tip .row b u { text-decoration:none; color:var(--gold); }
.h-tip .row b s { text-decoration:none; color:var(--dim); }
.h-tip .foot { display:flex; gap:6u; margin-top:3u; padding-top:3u; border-top:1u solid #2a3248; font-family:'Press Start 2P',monospace; font-size:6u; flex-wrap:wrap; }
.h-tip .mana { color:#8fb4ff; } .h-tip .cd { color:#e6e6e6; } .h-tip .cost { color:var(--gold); }
.h-tip .note { color:var(--dim); margin-top:2u; }
.h-tip .stat { color:#7fe08f; }
.h-tip .tree { margin-top:3u; padding-top:3u; border-top:1u solid #2a3248; }
.h-tip .tr { display:flex; align-items:center; gap:2u; margin:1u 0; }
.h-tip .tr.have { color:#7fe08f; } .h-tip .tr canvas { width:calc(10 * var(--u)); height:calc(10 * var(--u)); }
.h-tip .tr span:last-child { margin-left:auto; color:var(--gold); font-family:'Press Start 2P',monospace; font-size:5u; }
.h-tip .bad { color:var(--warn); margin-top:3u; }

/* ---------- shop ---------- */
.h-shop { position:absolute; right:3u; bottom:68u; width:276u; height:176u; display:none; flex-direction:column; padding:4u; gap:3u; }
.h-shop.open { display:flex; }
.h-shop header { display:flex; align-items:center; gap:4u; height:11u; }
.h-shop header h3 { margin:0; font-size:9u; color:var(--gold); flex:1; font-weight:700; }
.h-shop header .st { font-size:7u; }
.h-shop .x { cursor:pointer; padding:1u 3u; background:#2a1414; color:#ff8a7a; box-shadow:0 0 0 1u var(--ink); }
.h-shop .x:hover { background:#4a1c1c; }
.h-shop .body { display:flex; gap:3u; flex:1; min-height:0; }
.h-shop .cats { width:60u; display:flex; flex-direction:column; gap:1u; }
.h-shop .cat { padding:3u 3u 2u; cursor:pointer; background:#10141e; box-shadow:0 0 0 1u var(--ink); color:var(--dim); font-size:6u; white-space:nowrap; }
.h-shop .cat.on { background:#2a2312; color:var(--gold); box-shadow:0 0 0 1u var(--gold2); }
.h-shop .grid { flex:1; display:grid; grid-template-columns:repeat(5,1fr); grid-auto-rows:min-content; gap:3u; align-content:start; overflow:hidden; }
.h-shop .it { position:relative; display:flex; flex-direction:column; align-items:center; gap:1u; padding:2u 0; cursor:pointer; background:#0d1019; box-shadow:0 0 0 1u var(--ink); }
.h-shop .it:hover { box-shadow:0 0 0 1u var(--gold); background:#171c2a; }
.h-shop .it canvas { width:calc(20 * var(--u)); height:calc(20 * var(--u)); }
.h-shop .it .c { font-family:'Press Start 2P',monospace; font-size:5u; color:var(--gold); }
.h-shop .it.poor .c { color:var(--warn); } .h-shop .it.poor canvas, .h-shop .it.off canvas { filter:grayscale(.8) brightness(.55); }
.h-shop .it.off { cursor:not-allowed; }
.h-shop footer { height:10u; display:flex; align-items:center; justify-content:space-between; color:var(--dim); }
.h-shop footer .rng { color:var(--warn); }
.h-ctx { position:fixed; z-index:60; pointer-events:auto; background:#0d1119; padding:2u; box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold2); display:none; min-width:60u; }
.h-ctx div { padding:3u 4u 2u; cursor:pointer; } .h-ctx div:hover { background:#2a2312; color:var(--gold); } .h-ctx div.dis { color:#5a6278; cursor:not-allowed; }

/* ---------- scoreboard ---------- */
.h-sb { position:absolute; left:50%; top:38u; transform:translateX(-50%); width:344u; display:none; padding:4u; gap:3u; flex-direction:column; }
.h-sb.open { display:flex; }
.h-sb .tm { display:flex; flex-direction:column; gap:1u; }
.h-sb .th { display:grid; grid-template-columns:14u 1fr 14u 44u 36u 42u; gap:2u; align-items:center; padding:2u 3u; font-size:7u; }
.h-sb .th.hd { color:var(--dim); } .h-sb .th.rad .n { color:var(--rad); } .h-sb .th.dire .n { color:var(--dire); }
.h-sb .th.row { background:#0d1119; height:13u; }
.h-sb .th.row.me { box-shadow:inset 0 0 0 1u var(--gold); }
.h-sb .th.row.dead { opacity:.6; }
.h-sb .th .k { font-family:'Press Start 2P',monospace; font-size:5u; text-align:right; }
.h-sb .th .n { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.h-sb .th canvas { display:block; }
.h-sb .ttl { font-size:9u; display:flex; justify-content:space-between; padding:0 3u; }
.h-sb .ttl.rad { color:var(--rad); } .h-sb .ttl.dire { color:var(--dire); }

/* ---------- feed / chat / messages ---------- */
.h-feed { position:absolute; right:4u; top:40u; width:150u; display:flex; flex-direction:column; align-items:flex-end; gap:2u; }
.h-kf { padding:2u 4u 1u; background:rgba(5,7,11,.78); box-shadow:0 0 0 1u var(--ink); display:flex; align-items:center; gap:3u; font-size:7u; white-space:nowrap; animation:h-in .2s steps(3); }
.h-kf.mine { box-shadow:0 0 0 1u var(--gold); }
.h-kf .rad { color:var(--rad); } .h-kf .dire { color:var(--dire); } .h-kf .g { color:var(--gold); font-family:'Press Start 2P',monospace; font-size:5u; }
.h-kf canvas { width:calc(9 * var(--u)); }
@keyframes h-in { from { transform:translateX(30u); opacity:0; } }
.h-msgs { position:absolute; left:50%; top:58u; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:3u; }
.h-msg { padding:3u 8u 2u; font-size:10u; font-weight:700; color:#fff; background:rgba(5,7,11,.72); box-shadow:0 0 0 1u var(--gold2); text-shadow:1u 1u 0 #000; animation:h-in2 .25s steps(4); }
.h-msg.warn { color:var(--warn); box-shadow:0 0 0 1u var(--warn); }
@keyframes h-in2 { from { transform:scale(1.4); opacity:0; } }
.h-chat { position:absolute; left:3u; bottom:114u; width:200u; display:flex; flex-direction:column; justify-content:flex-end; gap:1u; }
.h-chat .lines { display:flex; flex-direction:column; gap:1u; justify-content:flex-end; max-height:80u; overflow:hidden; }
.h-chat .ln { padding:1u 3u 0; background:rgba(5,7,11,.55); font-size:7u; word-break:break-word; transition:opacity .6s; }
.h-chat .ln.old { opacity:0; } .h-chat.typing .ln.old { opacity:1; }
.h-chat .ln .rad { color:var(--rad); } .h-chat .ln .dire { color:var(--dire); } .h-chat .ln .sys { color:var(--gold); }
.h-chat input { display:none; pointer-events:auto; width:100%; font:inherit; font-size:8u; color:#fff; background:#0b0e14; border:0; outline:0; padding:3u; box-shadow:0 0 0 1u var(--gold); }
.h-chat.typing input { display:block; }

/* ---------- selection card ---------- */
.h-sel { position:absolute; left:50%; bottom:62u; width:110u; padding:3u 4u; display:none; flex-direction:column; gap:2u; margin-left:-172u; }
.h-sel.on { display:flex; }
.h-sel .nm { font-size:8u; color:var(--gold); display:flex; justify-content:space-between; }
.h-sel .nm.e { color:var(--dire); }
.h-sel .b { height:7u; background:#10301a; box-shadow:0 0 0 1u var(--ink); position:relative; }
.h-sel .b i { display:block; height:100%; background:var(--hp); }
.h-sel .b.e i { background:var(--dire); }
.h-sel .b span { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:'Press Start 2P',monospace; font-size:5u; color:#fff; text-shadow:1u 1u 0 #000; }

/* ---------- end screen ---------- */
.h-end { position:absolute; inset:0; background:rgba(3,4,8,.78); display:none; flex-direction:column; align-items:center; justify-content:center; gap:10u; pointer-events:auto; }
.h-end.open { display:flex; }
.h-end h1 { margin:0; font-size:36u; letter-spacing:2u; text-shadow:3u 3u 0 #000; font-weight:700; }
.h-end h1.win { color:var(--gold); } .h-end h1.lose { color:var(--warn); }
.h-end .sub { font-size:10u; color:var(--dim); }
.h-end .btn { padding:6u 14u 5u; font-size:10u; cursor:pointer; color:#fff; background:linear-gradient(#34406a,#1d2540); box-shadow:0 0 0 1u var(--ink), inset 0 0 0 1u var(--gold); }
.h-end .btn:hover { background:linear-gradient(#4a5a96,#2a3560); }
.h-ring { position:absolute; inset:0; }
.h-pings { position:absolute; inset:0; }
`;

/** Expand `Nu` sizes into calc(N * var(--u)). */
export const expandUnits = (css) => css.replace(/(-?\d*\.?\d+)u\b/g, 'calc($1 * var(--u))');

export function injectStyle(doc = document) {
  if (doc.getElementById('h-style')) return;
  const el = doc.createElement('style');
  el.id = 'h-style';
  el.textContent = expandUnits(CSS);
  doc.head.appendChild(el);
  if (!doc.getElementById('h-fonts')) {
    const l = doc.createElement('link');
    l.id = 'h-fonts'; l.rel = 'stylesheet'; l.href = FONT_HREF;
    doc.head.appendChild(l);
  }
}

/** Integer HUD scale for a viewport. */
export const hudScale = (w, h) => Math.max(1, Math.min(4, Math.floor(Math.min(w / 580, h / 315))));
