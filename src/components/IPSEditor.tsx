import React, { useState } from 'react';
import { Save, Loader2, AlertCircle, Check, Edit2, X, FileText, BrainCircuit, Calendar, User, ShieldCheck, Target, TrendingUp, DollarSign, Scale, Printer, Download, Info } from 'lucide-react';
import { IPSDocument, TargetAllocation, Client } from '../types';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

interface IPSEditorProps {
  ips: IPSDocument & { target_allocations: TargetAllocation[] };
  client: Client;
  onSave: (updatedIps: any) => Promise<void>;
  viewerRole?: 'advisor' | 'client';
  onAccept?: () => Promise<void>;
}

export default function IPSEditor({ ips, client, onSave, viewerRole = 'advisor', onAccept }: IPSEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    investment_objective: ips.investment_objective,
    time_horizon_years: ips.time_horizon_years,
    liquidity_needs: ips.liquidity_needs,
    tax_considerations: ips.tax_considerations,
    rebalancing_frequency: ips.rebalancing_frequency,
    rebalancing_strategy_description: ips.rebalancing_strategy_description,
    monitoring_review_description: ips.monitoring_review_description,
    constraints_description: ips.constraints_description,
    goals_description: ips.goals_description,
    status: ips.status
  });

  const [allocations, setAllocations] = useState<TargetAllocation[]>(ips.target_allocations || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'time_horizon_years' || name === 'liquidity_needs' || name === 'tax_considerations' 
        ? parseFloat(value) 
        : value
    }));
  };

  const handleAllocationChange = (index: number, field: keyof TargetAllocation, value: string) => {
    const newAllocations = [...allocations];
    newAllocations[index] = {
      ...newAllocations[index],
      [field]: parseFloat(value)
    };
    setAllocations(newAllocations);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await onSave({
        ...formData,
        allocations
      });
      setSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save IPS');
    } finally {
      setSaving(false);
    }
  };

  const totalTarget = allocations.reduce((sum, a) => sum + (a.target_percent || 0), 0);

  // Helper for AI Badge
  const AIBadge = ({ isAllocation = false }: { isAllocation?: boolean }) => (
    <span className="group relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wider ml-2 align-middle cursor-help">
      <BrainCircuit className="w-3 h-3" />
      AI Analysis
      <Info className="w-3 h-3 text-blue-400" />
      
      {/* Tooltip */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none text-left normal-case tracking-normal font-normal">
        <p className="font-bold mb-1 text-slate-200">Data Considered for AI Generation:</p>
        <ul className="list-disc pl-4 space-y-1 text-slate-300">
          <li><span className="font-semibold text-white">Client Context:</span> Income, Net Worth, Tax Bracket, DOB</li>
          <li><span className="font-semibold text-white">Risk Profile:</span> Finalized risk score and category</li>
          {isAllocation && (
            <li><span className="font-semibold text-white">Base Allocation Model:</span> Thematic model for the client's risk category</li>
          )}
          <li><span className="font-semibold text-white">Questionnaire:</span> Behavioral insights and answers</li>
        </ul>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
      </div>
    </span>
  );

  // Helper for Advisor Name
  const advisorName = ips.clients?.advisors?.full_name;

  const AdvisorSignature = () => {
    if (!advisorName) {
      return <span className="text-sm text-slate-400 italic">Loading advisor...</span>;
    }
    return (
      <p className="font-semibold text-slate-900">{advisorName}</p>
    );
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const input = document.getElementById('ips-document');
      if (!input) return;

      // Create a wrapper to isolate the clone and ensure fixed width
      const wrapper = document.createElement('div');
      wrapper.style.position = 'absolute';
      wrapper.style.left = '-9999px';
      wrapper.style.top = '0';
      wrapper.style.width = '1024px';
      wrapper.style.zIndex = '-1';
      document.body.appendChild(wrapper);

      // Clone the node
      const clone = input.cloneNode(true) as HTMLElement;
      
      // Reset styles that might interfere with full capture
      clone.style.width = '100%';
      clone.style.maxWidth = 'none';
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.margin = '0';
      clone.style.transform = 'none';
      
      wrapper.appendChild(clone);

      // Wait for layout and potential font rendering
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toPng(clone, {
        cacheBust: false, // Disable cache bust to avoid reloading resources
        backgroundColor: '#ffffff',
        width: 1024,
        height: clone.scrollHeight,
        style: {
          transform: 'scale(1)', // Force scale
        }
      });

      // console.log('Generated image size:', dataUrl.length);

      const pdfHeight = clone.scrollHeight;
      document.body.removeChild(wrapper);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [1024, pdfHeight]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, 1024, pdfHeight);
      pdf.save(`IPS_${client.last_name}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="space-y-6 print:space-y-0">
        {/* Actions Bar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:hidden relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <FileText className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Investment Policy Statement</h3>
              <p className="text-xs text-slate-500">Version 1.0 • {new Date(ips.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
              formData.status === 'Finalized' || formData.status === 'Active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {(formData.status === 'Finalized' || formData.status === 'Active') ? <ShieldCheck className="w-3.5 h-3.5" /> : null}
              {formData.status === 'Active' ? 'Active Policy' : (formData.status === 'Finalized' ? 'Finalized' : 'Draft Mode')}
            </span>
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm cursor-pointer relative z-20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF'}
            </button>
            {viewerRole === 'advisor' && formData.status !== 'Active' && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
              >
                <Edit2 className="w-4 h-4" />
                Edit Document
              </button>
            )}
          </div>
        </div>

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 text-emerald-800 animate-in fade-in slide-in-from-top-2 print:hidden">
            <Check className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">IPS updated successfully.</p>
          </div>
        )}

        {/* DOCUMENT VIEW */}
        <div id="ips-document" className="bg-white shadow-lg rounded-xl border border-slate-200 overflow-hidden max-w-5xl mx-auto print:shadow-none print:border-none print:max-w-none print:m-0 print:rounded-none">
          
          {/* Header Section */}
          <div className="bg-white border-b border-slate-200 p-10">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">Investment Policy Statement</h1>
                <p className="text-slate-500 text-sm uppercase tracking-widest font-medium">Confidential Client Document</p>
              </div>
              <div className="text-right">
                <div className="inline-block px-3 py-1 bg-white border border-slate-200 rounded text-xs font-mono text-slate-500">
                  REF: {ips.id.slice(0, 8).toUpperCase()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Prepared For</p>
                <p className="font-semibold text-slate-900 flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {client.first_name} {client.last_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Advisor</p>
                <AdvisorSignature />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Date Created</p>
                <p className="font-semibold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {new Date(ips.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Review Date</p>
                <p className="font-semibold text-slate-900">
                  {new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <div className="p-10 space-y-12">
            
            {/* Section I: Purpose */}
            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-3 mb-6 flex items-center gap-2">
                <span className="text-slate-400">01</span> Purpose & Mandate <AIBadge />
              </h2>
              <div className="space-y-6 text-slate-700 leading-relaxed">
                <p>
                  This Investment Policy Statement (IPS) establishes the investment mandate for <strong>{client.first_name} {client.last_name}</strong>. 
                  It defines the investment objectives, risk tolerance, and constraints that will guide the management of the portfolio.
                </p>
                <p className="italic text-slate-600">
                  "{formData.investment_objective || "To grow capital over the long term while managing risk according to the client's profile."}"
                </p>
              </div>
            </section>

            {/* Section II: Objectives */}
            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-3 mb-6 flex items-center gap-2">
                <span className="text-slate-400">02</span> Investment Objectives & Goals <AIBadge />
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Risk Profile</h3>
                  </div>
                  <p className="text-lg font-bold text-slate-900">{ips.risk_category}</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Time Horizon</h3>
                  </div>
                  <p className="text-lg font-bold text-slate-900">{formData.time_horizon_years} Years</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Liquidity Needs</h3>
                  </div>
                  <p className="text-lg font-bold text-slate-900">${formData.liquidity_needs?.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="space-y-6 text-slate-700 leading-relaxed">
                <p>
                  The portfolio is constructed with a <strong>{ips.risk_category}</strong> risk orientation. 
                  The primary goal is to achieve returns consistent with this risk profile over a <strong>{formData.time_horizon_years}-year</strong> horizon, 
                  while maintaining sufficient liquidity to meet immediate needs of <strong>${formData.liquidity_needs?.toLocaleString()}</strong>.
                </p>

                <p>
                  {formData.goals_description || (ips.risk_assessments?.ai_behavior_summary ? ips.risk_assessments.ai_behavior_summary.split('[')[0].trim() : "The investment strategy is designed to align with the client's long-term financial objectives.")}
                </p>
              </div>
            </section>

            {/* Section III: Constraints */}
            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <span className="text-slate-400">03</span> Constraints & Considerations <AIBadge />
              </h2>
              <div className="space-y-6">
                <p className="text-sm text-slate-600 leading-relaxed">
                  {formData.constraints_description || "The portfolio is managed with consideration for the client's specific liquidity needs, tax situation, and any unique circumstances or restrictions."}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-3 bg-white rounded border border-slate-100">
                    <Scale className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase">Tax Considerations</h4>
                      <p className="text-sm text-slate-600">Managed for a {formData.tax_considerations}% marginal tax bracket.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white rounded border border-slate-100">
                    <ShieldCheck className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase">Unique Circumstances</h4>
                      <p className="text-sm text-slate-600">None specified.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section IV: Asset Allocation */}
            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <span className="text-slate-400">04</span> Target Asset Allocation <AIBadge isAllocation={true} />
              </h2>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left">Asset Class</th>
                      <th className="px-4 py-3 text-right">Target Allocation</th>
                      <th className="px-4 py-3 text-right">Lower Band</th>
                      <th className="px-4 py-3 text-right">Upper Band</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allocations.map((alloc, idx) => (
                      <tr key={alloc.id || idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{alloc.asset_class}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">{alloc.target_percent}%</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">{alloc.lower_band}%</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">{alloc.upper_band}%</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                      <td className="px-4 py-3 text-slate-900">Total Portfolio</td>
                      <td className="px-4 py-3 text-right text-slate-900">{totalTarget.toFixed(0)}%</td>
                      <td className="px-4 py-3 text-right" colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section V: Rebalancing */}
            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <span className="text-slate-400">05</span> Rebalancing Strategy <AIBadge />
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                {formData.rebalancing_strategy_description || "The portfolio will be monitored and rebalanced to maintain the target asset allocation. Rebalancing occurs when an asset class drifts outside its allowable range (bands) or on a scheduled basis."}
              </p>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-slate-500 font-medium">Frequency:</span>
                  <span className="ml-2 font-semibold text-slate-900">{formData.rebalancing_frequency}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Drift Tolerance:</span>
                  <span className="ml-2 font-semibold text-slate-900">+/- 5% (Absolute)</span>
                </div>
              </div>
            </section>

            {/* Section VI: Monitoring */}
            <section>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <span className="text-slate-400">06</span> Monitoring & Review <AIBadge />
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {formData.monitoring_review_description || "The advisor will review the portfolio performance and the client's circumstances at least Annually. Performance will be measured against a composite benchmark reflecting the target asset allocation."}
              </p>
            </section>

            {/* Signatures */}
            <section className="pt-8 mt-12 border-t-2 border-slate-100">
              <div className="grid grid-cols-2 gap-12">
                {/* Client Signature */}
                <div>
                  <div className="h-16 border-b border-slate-300 mb-2 flex items-end pb-1 justify-between">
                    {ips.client_accepted_at ? (
                      <span className="font-handwriting text-2xl text-slate-800">
                        {client.first_name} {client.last_name}
                      </span>
                    ) : (
                      viewerRole === 'client' && onAccept && ips.status === 'Finalized' && (
                        <button
                          onClick={onAccept}
                          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded hover:bg-blue-700 transition-colors mb-1 print:hidden"
                        >
                          Accept & Sign
                        </button>
                      )
                    )}
                    {ips.client_accepted_at && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider flex items-center gap-1 mb-1">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase">Client Signature</p>
                  <p className="text-sm font-medium text-slate-900">{client.first_name} {client.last_name}</p>
                  {ips.client_accepted_at && (
                    <p className="text-xs text-slate-400 mt-1">Signed on {new Date(ips.client_accepted_at).toLocaleDateString()} at {new Date(ips.client_accepted_at).toLocaleTimeString()}</p>
                  )}
                </div>

                {/* Advisor Signature */}
                <div>
                  <div className="h-16 border-b border-slate-300 mb-2 flex items-end pb-1 justify-between">
                    {ips.advisor_accepted_at ? (
                      <span className="font-handwriting text-2xl text-slate-800">
                        {advisorName}
                      </span>
                    ) : (
                      viewerRole === 'advisor' && onAccept && ips.status === 'Finalized' && (
                        <button
                          onClick={onAccept}
                          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded hover:bg-blue-700 transition-colors mb-1 print:hidden"
                        >
                          Accept & Sign
                        </button>
                      )
                    )}
                    {ips.advisor_accepted_at && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider flex items-center gap-1 mb-1">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase">Advisor Signature</p>
                  <AdvisorSignature />
                  {ips.advisor_accepted_at && (
                    <p className="text-xs text-slate-400 mt-1">Signed on {new Date(ips.advisor_accepted_at).toLocaleDateString()} at {new Date(ips.advisor_accepted_at).toLocaleTimeString()}</p>
                  )}
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header / Status */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Edit IPS Draft</h3>
          <p className="text-sm text-slate-500">Make changes to the Investment Policy Statement.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            name="status"
            value={formData.status}
            onChange={handleInputChange}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border focus:ring-2 focus:ring-blue-500 outline-none ${
              formData.status === 'Finalized' 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <option value="Draft">Draft Mode</option>
            <option value="Finalized">Finalized</option>
          </select>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Core Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Investment Objective</label>
          <textarea
            name="investment_objective"
            value={formData.investment_objective}
            onChange={handleInputChange}
            rows={12}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white leading-relaxed"
            placeholder="Enter the investment objective..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Time Horizon (Years)</label>
          <input
            type="number"
            name="time_horizon_years"
            value={formData.time_horizon_years}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Liquidity Needs ($)</label>
          <input
            type="number"
            name="liquidity_needs"
            value={formData.liquidity_needs}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tax Bracket (%)</label>
          <input
            type="number"
            name="tax_considerations"
            value={formData.tax_considerations}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rebalancing Frequency</label>
          <select
            name="rebalancing_frequency"
            value={formData.rebalancing_frequency}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="Quarterly">Quarterly</option>
            <option value="Semi-Annually">Semi-Annually</option>
            <option value="Annually">Annually</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Goals & Objectives Description</label>
          <textarea
            name="goals_description"
            value={formData.goals_description || ''}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white leading-relaxed"
            placeholder="Describe the client's specific goals and objectives..."
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Constraints & Considerations Description</label>
          <textarea
            name="constraints_description"
            value={formData.constraints_description || ''}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white leading-relaxed"
            placeholder="Describe any constraints, tax considerations, or unique circumstances..."
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Rebalancing Strategy Description</label>
          <textarea
            name="rebalancing_strategy_description"
            value={formData.rebalancing_strategy_description || ''}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white leading-relaxed"
            placeholder="Describe the rebalancing strategy..."
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Monitoring & Review Description</label>
          <textarea
            name="monitoring_review_description"
            value={formData.monitoring_review_description || ''}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white leading-relaxed"
            placeholder="Describe the monitoring and review process..."
          />
        </div>
      </div>

      {/* Allocations Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900">Target Asset Allocation</h4>
          <span className={`text-xs font-mono font-medium ${Math.abs(totalTarget - 100) < 0.1 ? 'text-emerald-600' : 'text-red-500'}`}>
            Total: {totalTarget.toFixed(1)}%
          </span>
        </div>
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-medium border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Asset Class</th>
                <th className="px-4 py-3 w-32">Target %</th>
                <th className="px-4 py-3 w-32">Lower Band %</th>
                <th className="px-4 py-3 w-32">Upper Band %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocations.map((alloc, idx) => (
                <tr key={alloc.id || idx} className="bg-white">
                  <td className="px-4 py-2 font-medium text-slate-900">{alloc.asset_class}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={alloc.target_percent}
                      onChange={(e) => handleAllocationChange(idx, 'target_percent', e.target.value)}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-right focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={alloc.lower_band}
                      onChange={(e) => handleAllocationChange(idx, 'lower_band', e.target.value)}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-right focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={alloc.upper_band}
                      onChange={(e) => handleAllocationChange(idx, 'upper_band', e.target.value)}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-right focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>
    </form>
  );
}
