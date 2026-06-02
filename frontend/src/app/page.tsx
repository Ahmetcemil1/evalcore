"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Shield, 
  Play, 
  Loader2, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Layers, 
  HelpCircle, 
  ExternalLink,
  Search,
  Sliders,
  ChevronDown,
  ChevronUp,
  LogIn,
  UserPlus,
  LogOut,
  Lock,
  Mail
} from "lucide-react";

interface TestResult {
  test_id: string;
  category: string;
  subcategory: string;
  prompt: string;
  target_response: string;
  evaluation_criteria: string;
  regulatory_mapping: string;
  score: number;
  verdict: string;
  justification: string;
  regulatory_infringement: string;
}

interface Summary {
  overall_compliance_score: number;
  total_audited: number;
  safe_count: number;
  warnings_count: number;
  violations_count: number;
  category_breakdown: Record<string, number>;
}

export default function Home() {
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"LOGIN" | "SIGNUP">("LOGIN");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Auth registration metadata
  const [authAccountType, setAuthAccountType] = useState<"individual" | "company">("individual");
  const [authCompanyName, setAuthCompanyName] = useState("");
  const [authRole, setAuthRole] = useState("Software Developer / Engineer");

  // Config state
  const [targetApiUrl, setTargetApiUrl] = useState("http://localhost:8000/api/dataset");
  const [targetApiKey, setTargetApiKey] = useState("dummy-key");
  const [targetModelName, setTargetModelName] = useState("gpt-3.5-turbo");
  const [judgeApiKey, setJudgeApiKey] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "Security",
    "Bias & Fairness",
    "Hallucination & Accuracy",
    "Legal & Transparency"
  ]);

  // UI state
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<"IDLE" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED">("IDLE");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobsHistory, setJobsHistory] = useState<any[]>([]);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVerdict, setFilterVerdict] = useState<string>("ALL");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Load token and jobs history on start
  useEffect(() => {
    const savedToken = localStorage.getItem("evalcore_token");
    if (savedToken) {
      setToken(savedToken);
      fetchJobsHistory(savedToken);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("evalcore_token");
    setToken(null);
    setJobsHistory([]);
    setStatus("IDLE");
    setResults([]);
    setSummary(null);
    if (pollingInterval.current) clearInterval(pollingInterval.current);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthLoading(true);

    try {
      if (authMode === "SIGNUP") {
        const response = await fetch("http://localhost:8000/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: authEmail, 
            password: authPassword,
            account_type: authAccountType,
            company_name: authAccountType === "company" ? authCompanyName : null,
            user_role: authRole
          })
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Signup failed.");
        }
        setAuthSuccess("Registration successful! Please login below.");
        setAuthMode("LOGIN");
        setAuthPassword("");
      } else {
        // OAuth2 Password Grant requires application/x-www-form-urlencoded
        const formData = new URLSearchParams();
        formData.append("username", authEmail);
        formData.append("password", authPassword);

        const response = await fetch("http://localhost:8000/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Invalid credentials.");
        }
        const data = await response.json();
        localStorage.setItem("evalcore_token", data.access_token);
        setToken(data.access_token);
        fetchJobsHistory(data.access_token);
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchJobsHistory = async (activeToken: string) => {
    try {
      const response = await fetch("http://localhost:8000/api/audit/jobs", {
        headers: { "Authorization": `Bearer ${activeToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setJobsHistory(data);
      }
    } catch (err) {
      console.error("Failed to load jobs history", err);
    }
  };

  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const startAudit = async () => {
    if (!token) return;
    setStatus("PENDING");
    setProgress(0);
    setError(null);
    setSummary(null);
    setResults([]);
    setJobId(null);
    setExpandedRows({});

    try {
      const response = await fetch("http://localhost:8000/api/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          target_api_url: targetApiUrl,
          target_api_key: targetApiKey,
          target_model_name: targetModelName,
          judge_api_key: judgeApiKey || null,
          judge_model_name: "gpt-4o-mini", // Optimized cost-effective model
          selected_categories: selectedCategories
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to start audit job.");
      }

      const data = await response.json();
      setJobId(data.job_id);
      setStatus("RUNNING");
      pollJobStatus(data.job_id, token);
    } catch (err: any) {
      setStatus("FAILED");
      setError(err.message || "An unexpected error occurred.");
    }
  };

  const pollJobStatus = (id: string, activeToken: string) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);

    pollingInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/audit/jobs/${id}`, {
          headers: { "Authorization": `Bearer ${activeToken}` }
        });
        if (!response.ok) throw new Error("Failed to fetch job status.");
        
        const data = await response.json();
        setProgress(data.progress);
        
        if (data.results && data.results.length > 0) {
          setResults(data.results);
        }

        if (data.status === "COMPLETED") {
          setStatus("COMPLETED");
          setSummary(data);
          fetchJobsHistory(activeToken);
          if (pollingInterval.current) clearInterval(pollingInterval.current);
        } else if (data.status === "FAILED") {
          setStatus("FAILED");
          setError(data.error || "Audit job failed during run.");
          fetchJobsHistory(activeToken);
          if (pollingInterval.current) clearInterval(pollingInterval.current);
        }
      } catch (err: any) {
        setStatus("FAILED");
        setError(err.message || "Polling connection failed.");
        if (pollingInterval.current) clearInterval(pollingInterval.current);
      }
    }, 1500);
  };

  const selectHistoryJob = async (id: string) => {
    if (!token) return;
    setStatus("PENDING");
    setError(null);
    setSummary(null);
    setResults([]);
    setJobId(id);
    
    try {
      const response = await fetch(`http://localhost:8000/api/audit/jobs/${id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch details.");
      const data = await response.json();
      
      setStatus(data.status);
      setProgress(data.progress);
      setResults(data.results);
      
      if (data.status === "COMPLETED") {
        setSummary(data);
      } else if (data.status === "FAILED") {
        setError(data.error);
      } else if (data.status === "RUNNING") {
        pollJobStatus(id, token);
      }
    } catch (err: any) {
      setStatus("FAILED");
      setError(err.message);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered results
  const filteredResults = results.filter(r => {
    const matchesSearch = r.prompt.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.subcategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.test_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVerdict = filterVerdict === "ALL" || r.verdict === filterVerdict;
    return matchesSearch && matchesVerdict;
  });

  // --- RENDER AUTH SCREEN ---
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans p-6">
        <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 p-8 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-col items-center text-center mb-8">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-3 rounded-2xl shadow-xl shadow-blue-500/20 mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Welcome to EvalCore</h1>
            <p className="text-sm text-slate-400 mt-2">Sign in to initialize safety compliance audits.</p>
          </div>

          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
            {authError && (
              <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {authError}
              </div>
            )}
            {authSuccess && (
              <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {authSuccess}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="name@company.com" 
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="password"
                  required
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {authMode === "SIGNUP" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Account Type</label>
                  <select 
                    value={authAccountType}
                    onChange={e => setAuthAccountType(e.target.value as "individual" | "company")}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="individual">Individual Developer</option>
                    <option value="company">Company / Organization</option>
                  </select>
                </div>

                {authAccountType === "company" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Company Name</label>
                    <input 
                      type="text"
                      required
                      value={authCompanyName}
                      onChange={e => setAuthCompanyName(e.target.value)}
                      placeholder="Acme Corp" 
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Professional Role</label>
                  <select 
                    value={authRole}
                    onChange={e => setAuthRole(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="Software Developer / Engineer">Software Developer / Engineer</option>
                    <option value="Cybersecurity Analyst / Auditor">Cybersecurity Analyst / Auditor</option>
                    <option value="Compliance & Legal Executive">Compliance & Legal Executive</option>
                    <option value="AI Researcher / Data Scientist">AI Researcher / Data Scientist</option>
                    <option value="Product Manager / Founder">Product Manager / Founder</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </>
            )}

            <button 
              type="submit"
              disabled={authLoading}
              className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {authLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : authMode === "LOGIN" ? (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Register Account
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center relative z-20">
            <button 
              type="button"
              onClick={() => {
                setAuthMode(authMode === "LOGIN" ? "SIGNUP" : "LOGIN");
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 underline py-2 px-4 relative z-20"
            >
              {authMode === "LOGIN" ? "Need an account? Sign up" : "Already have an account? Log in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER MAIN INTERFACE ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white pb-12">
      
      {/* HEADER NAVBAR */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              EvalCore <span className="text-xs font-semibold px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">v1.1.0</span>
            </h1>
            <p className="text-xs text-slate-400">Secure Database-Backed AI Red Teaming</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 font-mono hidden md:inline">{authEmail}</span>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 rounded-lg border border-slate-700 text-xs font-medium text-slate-300"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: CONFIG & HISTORY */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Target Config */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col gap-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
              <Sliders className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-white">Target Configuration</h2>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">TARGET API ENDPOINT</label>
                <input 
                  type="text" 
                  value={targetApiUrl}
                  onChange={e => setTargetApiUrl(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">TARGET API AUTHORIZATION KEY</label>
                <input 
                  type="password" 
                  value={targetApiKey}
                  onChange={e => setTargetApiKey(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">TARGET MODEL ID</label>
                <input 
                  type="text" 
                  value={targetModelName}
                  onChange={e => setTargetModelName(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">JUDGE API KEY (OPENAI)</label>
                <input 
                  type="password" 
                  value={judgeApiKey}
                  onChange={e => setJudgeApiKey(e.target.value)}
                  placeholder="Uses backend server default" 
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="mt-2">
                <label className="block text-xs font-semibold text-slate-400 mb-2">COMPLIANCE TEST BATTERIES</label>
                <div className="flex flex-col gap-2">
                  {["Security", "Bias & Fairness", "Hallucination & Accuracy", "Legal & Transparency"].map(cat => (
                    <label key={cat} className="flex items-center gap-3 cursor-pointer text-sm text-slate-300 hover:text-white transition-colors">
                      <input 
                        type="checkbox"
                        checked={selectedCategories.includes(cat)}
                        onChange={() => handleCategoryToggle(cat)}
                        className="rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button 
              onClick={startAudit}
              disabled={status === "RUNNING" || status === "PENDING" || selectedCategories.length === 0}
              className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {status === "RUNNING" || status === "PENDING" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Auditing Model...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Initialize Compliance Audit
                </>
              )}
            </button>
          </div>

          {/* Persistent History List */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col gap-4">
            <h3 className="text-md font-bold text-white pb-3 border-b border-slate-800">Persistent Job History</h3>
            {jobsHistory.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2 text-center">No past audits found in DB.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {jobsHistory.map(job => (
                  <button 
                    key={job.job_id}
                    onClick={() => selectHistoryJob(job.job_id)}
                    className={`w-full text-left p-3 rounded-xl border text-xs flex justify-between items-center transition-all ${
                      jobId === job.job_id 
                        ? "bg-blue-600/10 border-blue-500/40 text-blue-300"
                        : "bg-slate-950/40 border-slate-850 hover:bg-slate-800/30 text-slate-300"
                    }`}
                  >
                    <div>
                      <span className="block font-bold text-white truncate max-w-[150px]">{job.target_model_name}</span>
                      <span className="block text-[10px] text-slate-500 mt-1">{job.job_id.slice(0, 8)}...</span>
                    </div>
                    <div className="text-right">
                      <span className="block font-bold text-blue-400">{job.overall_compliance_score}%</span>
                      <span className={`inline-block w-2.5 h-2.5 rounded-full mt-1 ${
                        job.status === "COMPLETED" ? "bg-emerald-500" :
                        job.status === "FAILED" ? "bg-rose-500" :
                        "bg-amber-500 animate-pulse"
                      }`}></span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: RUN STATUS & SUMMARY */}
        <section className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Audit Dashboard Overview */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm shadow-xl min-h-[350px] flex flex-col justify-between">
            
            {status === "IDLE" && (
              <div className="flex flex-col items-center justify-center text-center my-auto py-12">
                <Shield className="w-16 h-16 text-slate-700 mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Audit Suite Ready</h3>
                <p className="text-sm text-slate-400 max-w-md">
                  Specify target parameters. EvalCore SQLite backend will save all results persistently. Audits are ran async with status metrics.
                </p>
              </div>
            )}

            {(status === "RUNNING" || status === "PENDING") && (
              <div className="flex flex-col justify-between h-full my-auto py-8">
                <div className="flex flex-col items-center text-center mb-6">
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                  <h3 className="text-lg font-bold text-white">Active Audit Running</h3>
                  <p className="text-xs text-slate-400 mt-1">Job ID: {jobId}</p>
                </div>
                
                <div className="w-full max-w-lg mx-auto">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-slate-400 font-medium">Evaluation Progress</span>
                    <span className="text-blue-400 font-bold">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {status === "FAILED" && (
              <div className="flex flex-col items-center justify-center text-center my-auto py-12">
                <XCircle className="w-16 h-16 text-rose-500 mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Audit Failed</h3>
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-4 py-2.5 text-xs max-w-lg font-mono">
                  {error}
                </div>
              </div>
            )}

            {status === "COMPLETED" && summary && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-lg font-bold text-white">Compliance Summary</h3>
                    <p className="text-xs text-slate-400">Model: {targetModelName}</p>
                  </div>
                  {/* Secure JWT Authorized Report Downloader */}
                  <a 
                    href={`http://localhost:8000/api/audit/jobs/${jobId}/report?token=${token}`}
                    onClick={(e) => {
                      e.preventDefault();
                      // Download using JWT authentication
                      fetch(`http://localhost:8000/api/audit/jobs/${jobId}/report`, {
                        headers: { "Authorization": `Bearer ${token}` }
                      })
                      .then(res => res.blob())
                      .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `EvalCore_Audit_${jobId}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-semibold transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    Download PDF Report
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Trust Score</span>
                    <span className="text-3xl font-extrabold text-blue-400 mt-1">{summary.overall_compliance_score}%</span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Compliant</span>
                    <span className="text-3xl font-extrabold text-emerald-400 mt-1">{summary.safe_count}</span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Warnings</span>
                    <span className="text-3xl font-extrabold text-amber-500 mt-1">{summary.warnings_count}</span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Violations</span>
                    <span className="text-3xl font-extrabold text-rose-500 mt-1">{summary.violations_count}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Breakdown By Category</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(summary.category_breakdown).map(([cat, score]) => (
                      <div key={cat} className="bg-slate-950/30 border border-slate-850 rounded-xl p-3.5">
                        <div className="flex justify-between items-center text-xs mb-2">
                          <span className="text-slate-300 font-semibold">{cat}</span>
                          <span className="font-bold text-blue-400">{score}%</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Logs table */}
          {results.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  Detailed Audit Logs
                </h3>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Search prompts..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <select
                    value={filterVerdict}
                    onChange={e => setFilterVerdict(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="ALL">All Verdicts</option>
                    <option value="SAFE">Safe Only</option>
                    <option value="WARNING">Warnings Only</option>
                    <option value="VIOLATION">Violations Only</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-bold">
                      <th className="py-3 px-4">Test ID</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Verdict</th>
                      <th className="py-3 px-4">Score</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map(res => {
                      const isExpanded = !!expandedRows[res.test_id];
                      return (
                        <React.Fragment key={res.test_id}>
                          <tr 
                            onClick={() => toggleRow(res.test_id)}
                            className="border-b border-slate-855 hover:bg-slate-800/20 cursor-pointer text-sm text-slate-300 transition-colors"
                          >
                            <td className="py-3 px-4 font-mono text-xs">{res.test_id}</td>
                            <td className="py-3 px-4 text-xs font-medium">
                              {res.category} <span className="text-[10px] text-slate-500">({res.subcategory})</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                res.verdict === "SAFE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                res.verdict === "WARNING" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              }`}>
                                {res.verdict === "SAFE" && <CheckCircle className="w-3 h-3" />}
                                {res.verdict === "WARNING" && <AlertTriangle className="w-3 h-3" />}
                                {res.verdict === "VIOLATION" && <XCircle className="w-3 h-3" />}
                                {res.verdict}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-xs">{res.score}/100</td>
                            <td className="py-3 px-4 text-slate-500">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-950/40 border-b border-slate-800">
                              <td colSpan={5} className="py-4 px-6 text-xs text-slate-300 flex flex-col gap-3">
                                <div>
                                  <span className="block font-bold text-slate-400 mb-1 uppercase text-[9px] tracking-wider">Test Prompt</span>
                                  <div className="bg-slate-950 border border-slate-855 p-3 rounded-lg font-mono leading-relaxed text-slate-300 whitespace-pre-wrap">{res.prompt}</div>
                                </div>
                                
                                <div>
                                  <span className="block font-bold text-slate-400 mb-1 uppercase text-[9px] tracking-wider">Model Response</span>
                                  <div className="bg-slate-950 border border-slate-855 p-3 rounded-lg font-mono leading-relaxed text-slate-300 whitespace-pre-wrap">{res.target_response}</div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <span className="block font-bold text-slate-400 mb-1 uppercase text-[9px] tracking-wider">Judge Justification</span>
                                    <p className="leading-relaxed text-slate-300">{res.justification}</p>
                                  </div>
                                  <div>
                                    <span className="block font-bold text-slate-400 mb-1 uppercase text-[9px] tracking-wider">Regulatory Mapping</span>
                                    <p className="leading-relaxed text-blue-400 font-semibold">{res.regulatory_mapping}</p>
                                    {res.regulatory_infringement !== "None" && (
                                      <p className="mt-1 text-rose-400 font-bold flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        Infringement: {res.regulatory_infringement}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
