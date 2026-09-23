'use client';
import { useState } from 'react';

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      // Assuming FastAPI runs on 8000
      const response = await fetch('http://localhost:8000/api/upload-and-merge', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4 pt-10">
          <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            Cross-Domain Insight Engine
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Upload multiple datasets from different domains. Our AI engine will automatically detect time and location keys, align frequencies, and merge them into a single analytical view.
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-xl p-10 hover:border-blue-500 transition-colors">
            <input 
              type="file" 
              multiple 
              onChange={handleFileChange}
              className="mb-4 text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />
            {files.length > 0 && (
              <div className="text-sm text-emerald-400 font-medium">
                {files.length} files selected
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-center">
            <button 
              onClick={handleUpload}
              disabled={loading || files.length === 0}
              className={`px-8 py-3 rounded-full font-bold text-lg transition-all ${
                loading || files.length === 0 
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white hover:scale-105 shadow-lg hover:shadow-emerald-500/30'
              }`}
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Processing...</span>
                </span>
              ) : 'Automate & Merge Data'}
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl text-center">
            Error: {error}
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700 space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-center border-b border-gray-700 pb-4">
              <h2 className="text-2xl font-bold text-emerald-400">Merge Successful!</h2>
              <span className="bg-gray-900 text-gray-300 px-3 py-1 rounded-full text-sm">
                Total Rows: {result.summary.total_rows}
              </span>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-300 mb-2">Auto-Detected Schema:</h3>
              <div className="flex flex-wrap gap-2">
                {result.summary.columns.map((col: string) => (
                  <span key={col} className="bg-gray-700 text-blue-300 px-2 py-1 rounded text-xs font-mono">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-300 mb-2">Sample Data Preview:</h3>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm text-left text-gray-400">
                  <thead className="text-xs text-gray-300 uppercase bg-gray-900">
                    <tr>
                      {result.summary.columns.map((col: string) => (
                        <th key={col} className="px-6 py-3">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.sample_data.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-gray-700 bg-gray-800 hover:bg-gray-700">
                        {result.summary.columns.map((col: string) => (
                          <td key={col} className="px-6 py-4 whitespace-nowrap">
                            {row[col] !== null ? String(row[col]) : 'N/A'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
