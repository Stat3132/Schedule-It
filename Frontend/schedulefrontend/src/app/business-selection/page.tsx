"use client";
import { useState } from 'react';
import { Search, Building2, CheckCircle, XCircle } from 'lucide-react';

interface Business {
  id: string;
  business_name: string;
  location: string;
  created_at: string;
}

export default function BusinessSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Business[]>([]);
  const [isSearching] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  const handleBusinessSelect = (business: Business) => {
    setSelectedBusiness(business);
    setSearchQuery(business.business_name);
    setSearchResults([]);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="bg-primary px-8 py-10">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                <Building2 className="w-10 h-10 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-primary-foreground text-center">
              Find Your Business
            </h1>
            <p className="text-primary-foreground/80 text-center mt-2">
              Search for your registered corporation
            </p>
          </div>

          <div className="px-8 py-10">
            <div className="relative">
              <label htmlFor="businessSearch" className="block text-sm font-semibold text-foreground mb-2">
                Business Name
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  id="businessSearch"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedBusiness(null);
                  }}
                  className="w-full pl-12 pr-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Start typing to search..."
                  autoComplete="off"
                />
                {isSearching && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-background border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map((business) => (
                    <button
                      key={business.id}
                      onClick={() => handleBusinessSelect(business)}
                      className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-b-0 flex items-start gap-3"
                    >
                      <Building2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{business.business_name}</p>
                        <p className="text-sm text-muted-foreground truncate">{business.location}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-destructive">Business not found</p>
                    <p className="text-sm text-destructive/80 mt-1">
                      No registered businesses match {searchQuery}
                    </p>
                  </div>
                </div>
              )}

              {selectedBusiness && (
                <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-green-900 text-lg">Business Found!</p>
                      <p className="text-green-700 mt-1">{selectedBusiness.business_name}</p>
                      <p className="text-sm text-green-600 mt-1">{selectedBusiness.location}</p>
                      <p className="text-xs text-green-600 mt-2">
                        Registered: {new Date(selectedBusiness.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {searchQuery.length === 0 && (
              <div className="mt-8 text-center text-muted-foreground">
                <p className="text-sm">Start typing to search for a registered business</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
