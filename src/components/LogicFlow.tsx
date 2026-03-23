import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface LogicFlowProps {
  onClose: () => void;
}

/**
 * LogicFlow component displays the AI Process Flow diagram exactly as provided by the user.
 */
export default function LogicFlow({ onClose }: LogicFlowProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 z-50 overflow-hidden"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-[2.5rem] max-w-[1400px] w-full max-h-[95vh] overflow-y-auto relative shadow-2xl border border-white/20 scrollbar-hide"
      >
        <style>{`
          .logic-flow-root {
            --p: #7c3aed;
            --pd: #4c1d95;
            --pl: #ede9fe;
            --g: #059669;
            --gl: #d1fae5;
            --gd: #065f46;
            --a: #d97706;
            --al: #fef3c7;
            --ad: #92400e;
            --b: #2563eb;
            --bl: #dbeafe;
            --bd: #1e40af;
            --r: #dc2626;
            --rl: #fee2e2;
            font-family: "Segoe UI", system-ui, Arial, sans-serif;
            color: #374151;
            background: #f3f4f6;
            text-align: left;
          }
          .logic-flow-root * {
            box-sizing: border-box;
          }
          .logic-flow-root .page {
            max-width: 1400px;
            margin: 0 auto;
            background: #fff;
            box-shadow: 0 0 40px rgba(0, 0, 0, 0.06);
            position: relative;
          }
          .logic-flow-root .hdr {
            background: linear-gradient(135deg, #3b0764, #5b21b6, #7c3aed);
            padding: 22px 44px 14px;
            position: relative;
            overflow: hidden;
          }
          .logic-flow-root .hdr::after {
            content: "";
            position: absolute;
            top: -40px;
            right: -40px;
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.04);
          }
          .logic-flow-root .hdr h1 {
            color: #fff;
            font-size: 20px;
            font-weight: 700;
            position: relative;
            z-index: 1;
            margin: 0;
          }
          .logic-flow-root .hdr p {
            color: #c4b5fd;
            font-size: 11.5px;
            margin-top: 3px;
            position: relative;
            z-index: 1;
            margin-bottom: 0;
          }
          .logic-flow-root .story {
            background: linear-gradient(90deg, #f5f3ff, #fffbeb, #ecfdf5, #dbeafe);
            padding: 9px 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11.5px;
            color: #374151;
            border-bottom: 1px solid #e5e7eb;
          }
          .logic-flow-root .story b { color: var(--pd); }
          .logic-flow-root .story .sa { color: var(--p); font-weight: 700; font-size: 13px; }
          .logic-flow-root .cvs { padding: 28px 40px 20px; }
          .logic-flow-root .bpmn-evt { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 0 auto; text-align: center; }
          .logic-flow-root .bpmn-evt .circle { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff; font-weight: 700; }
          .logic-flow-root .bpmn-start .circle { background: var(--p); border: 2.5px solid var(--pd); box-shadow: 0 3px 14px rgba(124, 58, 237, 0.25); }
          .logic-flow-root .bpmn-end .circle { background: var(--g); border: 4px solid var(--gd); box-shadow: 0 3px 14px rgba(5, 150, 105, 0.25); }
          .logic-flow-root .bpmn-evt .elbl { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
          .logic-flow-root .bpmn-start .elbl { color: var(--pd); }
          .logic-flow-root .bpmn-end .elbl { color: var(--gd); }
          .logic-flow-root .evt-wrap { text-align: center; margin-bottom: 4px; }
          .logic-flow-root .ph { border: 1.5px solid #e5e7eb; border-radius: 14px; padding: 18px 24px 20px; margin-bottom: 16px; background: #fafafe; position: relative; }
          .logic-flow-root .ph-p { border-left: 5px solid var(--p); }
          .logic-flow-root .ph-b { border-left: 5px solid var(--b); }
          .logic-flow-root .ph-g { border-left: 5px solid var(--g); }
          .logic-flow-root .ph-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding: 8px 14px; border-radius: 8px; }
          .logic-flow-root .ph-hdr .n { width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .logic-flow-root .ph-hdr .t { font-size: 14px; font-weight: 700; color: var(--pd); }
          .logic-flow-root .ph-hdr .timing { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 12px; padding: 2px 10px; font-size: 9.5px; font-weight: 600; color: #6b7280; white-space: nowrap; flex-shrink: 0; margin-left: 6px; }
          .logic-flow-root .ph-hdr .d { font-size: 10.5px; color: #6b7280; margin-left: auto; max-width: 440px; text-align: right; }
          .logic-flow-root .row { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: nowrap; }
          .logic-flow-root .tag { display: inline-block; font-size: 7px; font-weight: 800; letter-spacing: 0.6px; padding: 1.5px 6px; border-radius: 8px; margin-bottom: 3px; text-transform: uppercase; }
          .logic-flow-root .tag-c { background: #d1fae5; color: #065f46; }
          .logic-flow-root .tag-a { background: #fef3c7; color: #92400e; }
          .logic-flow-root .tag-s { background: #ede9fe; color: #5b21b6; }
          .logic-flow-root .step { background: #fff; border: 2px solid #d1d5db; border-radius: 12px; padding: 10px 14px; text-align: center; width: 128px; font-size: 11px; color: #374151; line-height: 1.3; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); }
          .logic-flow-root .step b { color: var(--pd); font-size: 11.5px; }
          .logic-flow-root .step .ico { font-size: 20px; display: block; margin-bottom: 3px; }
          .logic-flow-root .ai { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 108px; position: relative; }
          .logic-flow-root .ai .orb { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #9333ea); border: 3px solid #5b21b6; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 0 16px rgba(124, 58, 237, 0.28); position: relative; }
          .logic-flow-root .ai .orb::after { content: \"✦ AI\"; position: absolute; top: -7px; right: -12px; background: linear-gradient(135deg, #f59e0b, #eab308); color: #fff; font-size: 7px; font-weight: 800; padding: 2px 5px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); letter-spacing: 0.5px; }
          .logic-flow-root .ai .nm { font-size: 10.5px; font-weight: 700; color: var(--pd); text-align: center; line-height: 1.25; }
          .logic-flow-root .ai .sub { font-size: 9px; color: #6b7280; text-align: center; max-width: 108px; line-height: 1.2; }
          .logic-flow-root .hu { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100px; padding: 4px 0; }
          .logic-flow-root .hu .dia { width: 52px; height: 52px; border-radius: 4px; background: var(--al); border: 2.5px solid var(--a); transform: rotate(45deg); display: flex; align-items: center; justify-content: center; position: relative; }
          .logic-flow-root .hu .dia::after { content: \"👤\"; position: absolute; top: -8px; right: -9px; font-size: 12px; transform: rotate(-45deg); }
          .logic-flow-root .hu .dia span { transform: rotate(-45deg); font-size: 9.5px; font-weight: 700; color: var(--ad); text-align: center; line-height: 1.15; }
          .logic-flow-root .hu .ht { font-size: 8.5px; color: var(--ad); font-weight: 600; margin-top: 3px; white-space: nowrap; }
          .logic-flow-root .xor { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100px; padding: 4px 0; }
          .logic-flow-root .xor .dia { width: 52px; height: 52px; border-radius: 4px; background: var(--bl); border: 2.5px solid var(--b); transform: rotate(45deg); display: flex; align-items: center; justify-content: center; position: relative; }
          .logic-flow-root .xor .dia::after { content: \"✕\"; position: absolute; top: 50%; left: 50%; transform: rotate(-45deg) translate(-50%, -50%); transform-origin: 0 0; font-size: 16px; font-weight: 900; color: var(--bd); opacity: 0.5; }
          .logic-flow-root .xor .dia span { transform: rotate(-45deg); font-size: 9px; font-weight: 700; color: var(--bd); text-align: center; line-height: 1.15; position: relative; z-index: 1; }
          .logic-flow-root .xor .xt { font-size: 8.5px; color: var(--bd); font-weight: 600; white-space: nowrap; }
          .logic-flow-root .pgw { width: 32px; height: 32px; border-radius: 4px; background: #f5f3ff; border: 2.5px solid var(--p); transform: rotate(45deg); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
          .logic-flow-root .pgw span { transform: rotate(-45deg); font-size: 16px; font-weight: 900; color: var(--p); }
          .logic-flow-root .act { background: var(--gl); border: 2px solid var(--g); border-radius: 10px; padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 600; color: var(--gd); min-width: 108px; }
          .logic-flow-root .ds { background: #f5f3ff; border: 1.5px solid var(--p); border-radius: 8px; padding: 7px 11px; text-align: center; font-size: 10px; color: var(--pd); min-width: 100px; }
          .logic-flow-root .ds .tg { font-size: 7.5px; color: var(--p); font-style: italic; }
          .logic-flow-root .mon { background: var(--bl); border: 2px solid var(--b); border-radius: 10px; padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 600; color: var(--bd); min-width: 112px; }
          .logic-flow-root .combo { border: 2px dashed #c4b5fd; border-radius: 14px; padding: 10px 12px; background: linear-gradient(135deg, #faf5ff 60%, #fffbeb 100%); width: 140px; text-align: center; position: relative; }
          .logic-flow-root .combo .badge { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, var(--p), var(--a)); color: #fff; font-size: 7px; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
          .logic-flow-root .combo .txt { font-size: 9.5px; color: #374151; line-height: 1.3; margin-top: 4px; }
          .logic-flow-root .combo .txt b { color: var(--pd); }
          .logic-flow-root .arr { font-size: 18px; color: var(--p); font-weight: 700; flex-shrink: 0; }
          .logic-flow-root .arr-g { font-size: 18px; color: var(--g); font-weight: 700; flex-shrink: 0; }
          .logic-flow-root .arr-b { font-size: 18px; color: var(--b); font-weight: 700; flex-shrink: 0; }
          .logic-flow-root .arr-d { font-size: 18px; color: var(--p); font-weight: 700; text-align: center; display: block; }
          .logic-flow-root .lbl { font-size: 9px; font-weight: 600; text-align: center; display: block; }
          .logic-flow-root .lbl-g { color: var(--g); }
          .logic-flow-root .lbl-r { color: var(--r); }
          .logic-flow-root .lbl-b { color: var(--b); }
          .logic-flow-root .lbl-p { color: var(--p); }
          .logic-flow-root .br { font-size: 8px; font-weight: 700; display: block; text-align: center; line-height: 1; }
          .logic-flow-root .br-y { color: var(--g); }
          .logic-flow-root .br-n { color: var(--r); }
          .logic-flow-root .br-ok { color: var(--g); }
          .logic-flow-root .conn { text-align: center; padding: 6px 0; }
          .logic-flow-root .branch-note { display: flex; align-items: center; gap: 4px; justify-content: center; margin-top: 4px; font-size: 8.5px; font-weight: 600; line-height: 1; }
          .logic-flow-root .bn-pill { padding: 2px 7px; border-radius: 8px; font-size: 7.5px; font-weight: 800; letter-spacing: 0.4px; }
          .logic-flow-root .bn-no { background: var(--rl); color: var(--r); }
          .logic-flow-root .bn-yes { background: var(--gl); color: var(--gd); }
          .logic-flow-root .bn-rej { background: var(--rl); color: var(--r); }
          .logic-flow-root .loop-back { border: 2px dashed var(--b); border-top: none; border-radius: 0 0 12px 12px; padding: 6px 10px; margin: 6px auto 0; width: fit-content; display: flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600; color: var(--bd); }
          .logic-flow-root .leg { display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; padding: 14px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
          .logic-flow-root .leg-g h4 { font-size: 9.5px; font-weight: 700; color: var(--pd); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; margin-top: 0; }
          .logic-flow-root .li { display: flex; align-items: center; gap: 5px; font-size: 9.5px; color: #374151; margin-bottom: 3px; }
          .logic-flow-root .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
          .logic-flow-root .sq { width: 14px; height: 9px; border-radius: 3px; flex-shrink: 0; }
          .logic-flow-root .sm-dia { width: 9px; height: 9px; border-radius: 2px; transform: rotate(45deg); flex-shrink: 0; }
          .logic-flow-root .foot { background: #1f2937; padding: 8px 44px; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }
        `}</style>
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-900 transition-all bg-white/80 hover:bg-white rounded-full z-[60] shadow-md border border-slate-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="logic-flow-root">
          <div className="page">
            {/* ═══════════ HEADER ═══════════ */}
            <div className="hdr">
              <h1>
                Suitability + IPS Builder with Drift Enforcement — AI Process
                Flow
              </h1>
              <p>
                6 AI-Powered Steps &bull; 4 Human Approval Gates &bull;
                Event-Driven Drift Detection &bull; Fully Auditable &amp;
                Deterministic
              </p>
            </div>

            {/* ═══════════ STORY BAR ═══════════ */}
            <div className="story">
              <b>Investor Joins</b> <span className="sa">›</span>
              <b>Risk is AI-Analyzed</b> <span className="sa">›</span>
              <b>Investment Plan Created</b> <span className="sa">›</span>
              <b>Portfolio Constructed</b> <span className="sa">›</span>
              <b>AI Monitors Continuously</b>
            </div>

            <div className="cvs">
              {/* ═══════════ BPMN START EVENT ═══════════ */}
              <div className="evt-wrap">
                <div className="bpmn-evt bpmn-start">
                  <div className="circle">▶</div>
                  <span className="elbl">START</span>
                </div>
              </div>
              <div className="conn"><span className="arr-d">↓</span></div>

              {/* ══════════════════════════════════════════════════ */}
              {/* PHASE 0 — CLIENT ONBOARDING                       */}
              {/* ══════════════════════════════════════════════════ */}
              <div className="ph ph-g">
                <div className="ph-hdr" style={{ background: '#ecfdf5' }}>
                  <span className="n" style={{ background: 'var(--g)' }}>0</span>
                  <span className="t">Client Onboarding</span>
                  <span className="timing">⏱ ~15 min</span>
                  <span className="d">
                    Advisor registers client &rarr; Client completes
                    questionnaire &rarr; Auto-scored
                  </span>
                </div>

                <div className="row">
                  <div className="step">
                    <span className="tag tag-a">Advisor</span>
                    <span className="ico">🧑‍💼</span>
                    <b>Log In</b><br />
                    <span style={{ fontSize: '9px', color: '#6b7280' }}>Role-based dashboard</span>
                  </div>

                  <span className="arr">→</span>

                  <div className="step">
                    <span className="tag tag-a">Advisor</span>
                    <span className="ico">➕</span>
                    <b>Register Client</b><br />
                    <span style={{ fontSize: '9px', color: '#6b7280' }}>Profile, financials,<br />risk parameters</span>
                  </div>

                  <span className="arr">→</span>

                  <div className="step">
                    <span className="tag tag-c">Client</span>
                    <span className="ico">👤</span>
                    <b>Log In</b><br />
                    <span style={{ fontSize: '9px', color: '#6b7280' }}>Sees questionnaire</span>
                  </div>

                  <span className="arr">→</span>

                  <div className="step" style={{ borderColor: 'var(--p)', background: '#faf5ff' }}>
                    <span className="tag tag-c">Client</span>
                    <span className="ico">📋</span>
                    <b>Complete Questionnaire</b><br />
                    <span style={{ fontSize: '9px', color: '#6b7280' }}>Weighted risk questions</span>
                  </div>

                  <span className="arr">→</span>

                  <div className="act">
                    <span className="tag tag-s">System</span><br />
                    ✅ Create Assessment<br />
                    <span style={{ fontSize: '8.5px', fontWeight: 400 }}>Auto-scored &amp; categorized</span>
                  </div>
                </div>
              </div>

              <div className="conn">
                <span className="arr-d">↓</span>
                <span className="lbl lbl-g">Assessment ready for advisor review</span>
              </div>

              {/* ══════════════════════════════════════════════════ */}
              {/* PHASE 1 — AI RISK ANALYSIS                        */}
              {/* ══════════════════════════════════════════════════ */}
              <div className="ph ph-p">
                <div className="ph-hdr" style={{ background: '#f5f3ff' }}>
                  <span className="n" style={{ background: 'var(--p)' }}>1</span>
                  <span className="t">AI-Powered Risk Analysis</span>
                  <span className="timing">⏱ ~5 min AI + Review</span>
                  <span className="d">3 parallel AI analyses &rarr; Advisor finalizes risk category</span>
                </div>

                <div className="row">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    <div className="ds">
                      📊 Assessment &amp;<br />Questionnaire
                      <div className="tg">[Phase 0]</div>
                    </div>
                    <div className="ds">
                      👤 Client Profile<br />&amp; Financials
                      <div className="tg">[Data Source]</div>
                    </div>
                  </div>

                  <span className="arr">→</span>

                  <div className="pgw"><span>+</span></div>

                  <span className="arr">→</span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                    <div className="ai">
                      <div className="orb" style={{ width: '48px', height: '48px', fontSize: '18px' }}>🧠</div>
                      <div className="nm">Deterministic Scorer</div>
                      <div className="sub">Capacity + Tolerance</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                    <div className="ai">
                      <div className="orb" style={{ width: '48px', height: '48px', fontSize: '18px' }}>🔍</div>
                      <div className="nm">Consistency Analyzer</div>
                      <div className="sub">Flags contradictions</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                    <div className="ai">
                      <div className="orb" style={{ width: '48px', height: '48px', fontSize: '18px' }}>🎭</div>
                      <div className="nm">Bias Analyst</div>
                      <div className="sub">Behavioral patterns</div>
                    </div>
                  </div>

                  <span className="arr">→</span>

                  <div className="pgw"><span>+</span></div>

                  <span className="arr">→</span>

                  <div className="hu">
                    <span className="tag tag-a">Advisor</span>
                    <div className="dia"><span>Review<br />&amp; Finalize</span></div>
                    <div className="ht">
                      <span className="bn-pill bn-yes">Accept</span>
                      <span className="bn-pill" style={{ background: '#ede9fe', color: 'var(--pd)', marginLeft: '2px' }}>Override</span>
                    </div>
                    <div className="branch-note">
                      <span className="bn-pill bn-rej">Reject</span>
                      <span style={{ fontSize: '8px', color: 'var(--r)' }}>→ Reassess (Phase 0)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="conn">
                <span className="arr-d">↓</span>
                <span className="lbl lbl-g">Risk category finalized ✓</span>
              </div>

              {/* ══════════════════════════════════════════════════ */}
              {/* PHASE 2 — IPS GENERATION                          */}
              {/* ══════════════════════════════════════════════════ */}
              <div className="ph ph-p">
                <div className="ph-hdr" style={{ background: '#f5f3ff' }}>
                  <span className="n" style={{ background: 'var(--p)' }}>2</span>
                  <span className="t">Investment Policy Statement (IPS)</span>
                  <span className="timing">⏱ AI Draft + Review</span>
                  <span className="d">AI generates IPS &rarr; Advisor refines &rarr; Both accept</span>
                </div>

                <div className="row">
                  <div className="ds">
                    📊 Risk Category +<br />Allocation Model
                    <div className="tg">[Phase 1]</div>
                  </div>

                  <span className="arr">→</span>

                  <div className="ai">
                    <span className="tag tag-s">AI System</span>
                    <div className="orb">📝</div>
                    <div className="nm">Generate IPS</div>
                    <div className="sub">Objectives, bands<br />&amp; constraints</div>
                  </div>

                  <span className="arr">→</span>

                  <div className="combo">
                    <div className="badge">✦ AI Drafts &bull; 👤 Advisor Refines</div>
                    <div className="txt">
                      <span className="tag tag-a" style={{ marginBottom: '1px' }}>Advisor</span><br />
                      Reviews <b>target allocations</b>,<br />
                      bands &amp; rebalancing strategy
                    </div>
                  </div>

                  <span className="arr">→</span>

                  <div className="hu">
                    <span className="tag tag-a">Advisor</span>
                    <div className="dia"><span>Advisor<br />&amp; Client</span></div>
                    <div className="ht">
                      <span className="bn-pill bn-yes">Accept</span>
                      <span className="bn-pill" style={{ background: 'var(--al)', color: 'var(--ad)', marginLeft: '2px' }}>Revise</span>
                    </div>
                  </div>

                  <span className="arr-g">→</span>

                  <div className="act">
                    <span className="tag tag-s">System</span><br />
                    ✅ Activate IPS
                  </div>
                </div>
              </div>

              <div className="conn">
                <span className="arr-d">↓</span>
                <span className="lbl lbl-g">IPS active ✓</span>
              </div>

              {/* ══════════════════════════════════════════════════ */}
              {/* PHASE 3 — PORTFOLIO CONSTRUCTION                  */}
              {/* ══════════════════════════════════════════════════ */}
              <div className="ph ph-p">
                <div className="ph-hdr" style={{ background: '#f5f3ff' }}>
                  <span className="n" style={{ background: 'var(--p)' }}>3</span>
                  <span className="t">Portfolio Construction &amp; Approval</span>
                  <span className="timing">⏱ AI Draft + Multi-Party Review</span>
                  <span className="d">AI suggests holdings &rarr; Advisor edits &rarr; Client approves</span>
                </div>

                <div className="row">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    <div className="ds">
                      📈 Securities<br />Master List
                      <div className="tg">[Data Source]</div>
                    </div>
                    <div className="ds">
                      📋 Active IPS &amp;<br />Target Bands
                      <div className="tg">[Phase 2]</div>
                    </div>
                  </div>

                  <span className="arr">→</span>

                  <div className="ai">
                    <span className="tag tag-s">AI System</span>
                    <div className="orb">🏗️</div>
                    <div className="nm">Draft Portfolio</div>
                    <div className="sub">Select securities &amp;<br />allocate 100%</div>
                  </div>

                  <span className="arr">→</span>

                  <div className="combo">
                    <div className="badge">✦ AI Suggests &bull; 👤 Advisor Edits</div>
                    <div className="txt">
                      <span className="tag tag-a" style={{ marginBottom: '1px' }}>Advisor</span><br />
                      Add, remove, adjust %<br />
                      &amp; save holdings
                    </div>
                  </div>

                  <span className="arr">→</span>

                  <div className="hu">
                    <span className="tag tag-c">Client</span>
                    <div className="dia"><span>Client<br />Approve</span></div>
                    <div className="ht">
                      <span className="bn-pill bn-yes">Approve</span>
                      <span className="bn-pill" style={{ background: 'var(--al)', color: 'var(--ad)', marginLeft: '2px' }}>Request Changes</span>
                    </div>
                  </div>

                  <span className="arr-g">→</span>

                  <div className="act">
                    <span className="tag tag-s">System</span><br />
                    ⚡ Deploy Portfolio<br />
                    <span style={{ fontSize: '8.5px', fontWeight: 400 }}>Becomes read-only</span>
                  </div>
                </div>
              </div>

              <div className="conn">
                <span className="arr-d">↓</span>
                <span className="lbl lbl-b">Event-driven monitoring begins</span>
              </div>

              {/* ══════════════════════════════════════════════════ */}
              {/* PHASE 4 — MONITORING & REBALANCING                */}
              {/* ══════════════════════════════════════════════════ */}
              <div className="ph ph-b">
                <div className="ph-hdr" style={{ background: '#eff6ff' }}>
                  <span className="n" style={{ background: 'var(--b)' }}>4</span>
                  <span className="t">Continuous Monitoring &amp; Rebalancing</span>
                  <span className="timing">⏱ Continuous / Event-Driven</span>
                  <span className="d">Drift detected on events &rarr; AI analyzes &rarr; Advisor decides</span>
                </div>

                <div className="row" style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    <div className="ds">🔄 Holdings Saved <div className="tg">[Auto Trigger]</div></div>
                    <div className="ds">🖱️ Manual Request <div className="tg">[On-Demand]</div></div>
                  </div>

                  <span className="arr-b">→</span>

                  <div className="mon">
                    <span className="tag tag-s">System</span><br />
                    📡 Detect Drift<br />
                    <span style={{ fontSize: '8.5px', fontWeight: 400 }}>Actual vs IPS bands</span>
                  </div>

                  <span className="arr-b">→</span>

                  <div className="xor">
                    <span className="tag tag-s">System</span>
                    <div className="dia"><span>Drift<br />Found?</span></div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
                      <span className="bn-pill bn-yes" style={{ fontSize: '7px' }}>YES →</span>
                      <span className="bn-pill bn-no" style={{ fontSize: '7px' }}>NO ↓</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span className="arr" style={{ color: 'var(--r)' }}>→</span>
                    <span className="br br-n" style={{ color: 'var(--r)', fontSize: '7px' }}>Drift!</span>
                  </div>

                  <div className="ai">
                    <span className="tag tag-s">AI System</span>
                    <div className="orb">⚠️</div>
                    <div className="nm">Analyze Drift</div>
                    <div className="sub">Root cause &amp;<br />risk impact</div>
                  </div>

                  <span className="arr">→</span>

                  <div className="hu">
                    <span className="tag tag-a">Advisor</span>
                    <div className="dia"><span>Take<br />Action?</span></div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                      <span className="bn-pill bn-yes" style={{ fontSize: '7px' }}>Rebalance ↓</span>
                      <span className="bn-pill bn-no" style={{ fontSize: '7px' }}>No Action</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 60px 8px', fontSize: '9px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--gd)', background: '#ecfdf5', padding: '4px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                    <span style={{ fontSize: '11px' }}>✓</span>
                    <span><b>No Drift Path:</b> Portfolio healthy → Continue monitoring</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', background: '#f3f4f6', padding: '4px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}>
                    <span style={{ fontSize: '11px' }}>📝</span>
                    <span><b>No Action Path:</b> Log decision → Continue monitoring</span>
                  </div>
                </div>

                <div style={{ borderTop: '1.5px dashed #93c5fd', paddingTop: '10px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: '#eff6ff', padding: '0 10px', fontSize: '9px', fontWeight: 700, color: 'var(--bd)' }}>
                    ↓ REBALANCE SUB-FLOW
                  </div>

                  <div className="row" style={{ marginTop: '4px' }}>
                    <div className="ds">📋 Current Holdings<br />+ Drift Events <div className="tg">[System Data]</div></div>
                    <span className="arr">→</span>
                    <div className="ai">
                      <span className="tag tag-s">AI System</span>
                      <div className="orb">⚖️</div>
                      <div className="nm">Suggest Rebalance</div>
                      <div className="sub">Trades to restore<br />IPS targets</div>
                    </div>
                    <span className="arr">→</span>
                    <div className="combo">
                      <div className="badge">✦ AI Suggests &bull; 👤 Advisor Adjusts</div>
                      <div className="txt">
                        <span className="tag tag-a" style={{ marginBottom: '1px' }}>Advisor</span><br />
                        Accept, edit, or<br />override each trade
                      </div>
                    </div>
                    <span className="arr-g">→</span>
                    <div className="act">
                      <span className="tag tag-s">System</span><br />
                      ⚡ Save Holdings
                    </div>
                    <span className="arr-b">→</span>
                    <div className="mon" style={{ fontSize: '10px' }}>
                      <span className="tag tag-s">System</span><br />
                      🔄 Re-check Drift
                    </div>
                  </div>

                  <div className="loop-back">
                    ↩
                    <span>Loop: If drift persists → Back to Detect Drift &nbsp;|&nbsp; If resolved → Portfolio healthy ✓</span>
                  </div>
                </div>
              </div>

              <div className="conn">
                <span className="arr-d" style={{ color: 'var(--g)' }}>↓</span>
                <span className="lbl lbl-g">Portfolio healthy &amp; monitoring continues</span>
              </div>

              {/* ═══════════ BPMN END EVENT ═══════════ */}
              <div className="evt-wrap" style={{ marginBottom: '10px' }}>
                <div className="bpmn-evt bpmn-end">
                  <div className="circle">■</div>
                  <span className="elbl">END — Continuous Lifecycle</span>
                </div>
              </div>
            </div>

            {/* ═══════════ LEGEND ═══════════ */}
            <div className="leg">
              <div className="leg-g">
                <h4>Actors</h4>
                <div className="li"><span className="tag tag-c" style={{ fontSize: '8px' }}>Client</span> End investor / account holder</div>
                <div className="li"><span className="tag tag-a" style={{ fontSize: '8px' }}>Advisor</span> Financial advisor (human-in-the-loop)</div>
                <div className="li"><span className="tag tag-s" style={{ fontSize: '8px' }}>AI System</span> AI engine (deterministic: temp=0, seed=42)</div>
              </div>
              <div className="leg-g">
                <h4>Node Types</h4>
                <div className="li">
                  <span className="dot" style={{ background: 'var(--p)', boxShadow: '0 0 5px rgba(124, 58, 237, 0.2)', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '-2px', right: '-4px', fontSize: '4.5px', background: 'gold', color: '#fff', padding: '0 2px', borderRadius: '5px', fontWeight: 800 }}>AI</span>
                  </span>
                  &nbsp;AI-Powered Step
                </div>
                <div className="li"><span className="sm-dia" style={{ background: 'var(--al)', border: '1.5px solid var(--a)' }}></span> Human Approval Gate</div>
                <div className="li"><span className="sm-dia" style={{ background: 'var(--bl)', border: '1.5px solid var(--b)' }}></span> System XOR Gateway</div>
                <div className="li" style={{ marginLeft: '1px' }}>
                  <span style={{ border: '1.5px dashed #c4b5fd', borderRadius: '4px', padding: '1px 4px', fontSize: '6px', background: 'linear-gradient(135deg, #faf5ff 60%, #fffbeb 100%)' }}>✦+👤</span>
                  AI + Human Collab
                </div>
                <div className="li"><span className="sq" style={{ background: 'var(--gl)', border: '1.5px solid var(--g)' }}></span> Action / Execution</div>
                <div className="li"><span className="sq" style={{ background: 'var(--bl)', border: '1.5px solid var(--b)' }}></span> System / Monitor</div>
                <div className="li">
                  <span style={{ width: '20px', height: '20px', borderRadius: '3px', border: '2px solid var(--p)', background: '#f5f3ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(45deg)', flexShrink: 0 }}>
                    <span style={{ transform: 'rotate(-45deg)', fontSize: '10px', fontWeight: 900, color: 'var(--p)' }}>+</span>
                  </span>
                  &nbsp;Parallel Gateway (fork/join)
                </div>
              </div>
              <div className="leg-g">
                <h4>Allocation Models</h4>
                <div className="li">Conservative: 30% Eq / 60% Debt / 10% Alt</div>
                <div className="li">Mod. Conservative: 40 / 50 / 10</div>
                <div className="li">Moderate: 50 / 40 / 10</div>
                <div className="li">Mod. Aggressive: 60 / 30 / 10</div>
                <div className="li">Aggressive: 70 / 20 / 10</div>
              </div>
              <div className="leg-g">
                <h4>Key Differentiators</h4>
                <div className="li" style={{ maxWidth: '220px' }}>🔒 <b>Deterministic AI</b> — reproducible &amp; auditable</div>
                <div className="li" style={{ maxWidth: '220px' }}>🔄 <b>Event-Driven Drift</b> — not scheduled, on save &amp; manual</div>
                <div className="li" style={{ maxWidth: '220px' }}>👤+✦ <b>Human-in-the-Loop</b> — AI suggests, humans approve</div>
                <div className="li" style={{ maxWidth: '220px' }}>📐 <b>Dual Scoring</b> — Final = MIN(Capacity, Tolerance)</div>
              </div>
            </div>

            {/* ═══════════ FOOTER ═══════════ */}
            <div className="foot">
              <span>v2.0 &bull; March 2026</span>
              <span>Suitability + IPS Builder with Drift Enforcement</span>
              <span>Confidential</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
