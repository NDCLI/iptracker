import { useEffect, useState, useCallback } from 'react';
import { Activity, ShieldCheck, AlertCircle, Globe, Monitor, Clock, RefreshCw, Copy, Check } from 'lucide-react';

interface Visitor {
  ip: string;
  lastSeen: string;
  browser: string;
  os: string;
  device: string;
  city: string;
  country: string;
}

export default function App() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const fetchVisitors = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      const response = await fetch('/api/visitors');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch visitors');
      }
      
      setVisitors(data.visitors || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVisitors();
    
    // Poll every 30 seconds for near real-time updates
    const intervalId = setInterval(() => {
      fetchVisitors(true);
    }, 30000);
    
    return () => clearInterval(intervalId);
  }, [fetchVisitors]);

  const copyToClipboard = async (ip: string) => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopiedIp(ip);
      setTimeout(() => setCopiedIp(null), 2000);
    } catch (err) {
      console.error('Failed to copy IP', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 font-sans text-gray-900 relative">
      {/* Toast Notification */}
      <div 
        className={`fixed top-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center transition-all duration-300 z-50 ${copiedIp ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}
      >
        <Check className="w-5 h-5 mr-2 text-green-400" />
        <span className="font-medium">Copied {copiedIp} to clipboard!</span>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
        <div className="bg-blue-600 p-8 text-white">
          <div className="flex items-center gap-4 mb-2">
            <div className="bg-blue-500 p-3 rounded-xl">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">PostHog IP Access Dashboard</h1>
              <p className="text-blue-100 mt-1 text-sm">Viewing recent visitors fetched securely via PostHog API</p>
            </div>
          </div>
        </div>
        
        <div className="p-8">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Recent Web Visitors</h2>
              {lastUpdated && (
                <p className="text-xs text-gray-500 mt-1">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-500 flex items-center">
                {isRefreshing ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-blue-500" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                )}
                Auto-updating
              </span>
              
              <button 
                onClick={() => fetchVisitors(false)}
                disabled={loading || isRefreshing}
                className="text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg flex items-center transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading || isRefreshing ? 'animate-spin text-blue-500' : 'text-gray-500'}`} />
                Refresh
              </button>

              <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg flex items-center border border-gray-200">
                <ShieldCheck className="w-4 h-4 mr-1.5 text-green-600" />
                API Connected
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 h-16 rounded-xl w-full"></div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-100 flex items-start">
              <AlertCircle className="w-6 h-6 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800 mb-1">Error fetching data from PostHog</h3>
                <p className="text-sm">{error}</p>
                <p className="text-xs mt-3 bg-red-100 inline-block px-2 py-1 rounded text-red-800 font-mono">
                  Check POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID
                </p>
              </div>
            </div>
          ) : visitors.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
              <Globe className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <h3 className="text-gray-500 font-medium">No recent visitors found</h3>
              <p className="text-gray-400 text-sm mt-1">Make sure you have pageview events with IP tracking enabled in PostHog.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="pb-3 font-medium px-4">IP Address</th>
                    <th className="pb-3 font-medium px-4">Location</th>
                    <th className="pb-3 font-medium px-4">System / Browser</th>
                    <th className="pb-3 font-medium px-4">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visitors.map((visitor, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-4">
                        <button
                          onClick={() => copyToClipboard(visitor.ip)}
                          className="group flex items-center gap-2 font-mono text-gray-700 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 px-2.5 py-1.5 rounded transition-colors"
                          title="Click to copy IP"
                        >
                          {visitor.ip}
                          <Copy className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                        </button>
                      </td>
                      <td className="py-4 px-4 text-gray-600 flex items-center">
                        <Globe className="w-4 h-4 mr-2 text-gray-400" />
                        {visitor.city}, {visitor.country}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        <div className="flex items-center">
                          <Monitor className="w-4 h-4 mr-2 text-gray-400" />
                          {visitor.os} • {visitor.browser}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-500 flex items-center">
                        <Clock className="w-4 h-4 mr-2 text-gray-400" />
                        {new Date(visitor.lastSeen).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

