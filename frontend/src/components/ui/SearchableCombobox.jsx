import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export default function SearchableCombobox({
  value = "",
  onChange,
  options = [],
  placeholder = "Select or search...",
  searchPlaceholder = "Type to search...",
  disabled = false,
  allowCustom = true,
  className = "",
  testId,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const safeOptions = Array.isArray(options) ? options : [];

  // Filter options based on search
  const filtered = safeOptions.filter((opt) => {
    if (!opt) return false;
    const label = typeof opt === "string" ? opt : opt.label || opt.name || "";
    return String(label).toLowerCase().includes(search.toLowerCase());
  });

  const selectedLabel = (() => {
    if (!value) return "";
    const match = safeOptions.find((opt) => (typeof opt === "string" ? opt : opt.value || opt.id) === value);
    if (match) return typeof match === "string" ? match : match.label || match.name || value;
    return value;
  })();

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearch("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        data-testid={testId}
        className={`w-full min-h-[36px] h-9 rounded-md border px-3 flex items-center justify-between text-sm transition-colors cursor-pointer select-none bg-white ${
          disabled
            ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
            : isOpen
            ? "border-zinc-900 ring-1 ring-zinc-900"
            : "border-zinc-300 hover:border-zinc-400"
        }`}
      >
        <span className={`truncate mr-2 ${selectedLabel ? "text-zinc-900 font-medium" : "text-zinc-400"}`}>
          {selectedLabel || placeholder}
        </span>
        <div className="flex items-center gap-1 text-zinc-400 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:text-zinc-700 rounded transition-colors"
              title="Clear selection"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-zinc-200 rounded-md shadow-lg overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2">
            <Search size={14} className="text-zinc-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs text-zinc-800 placeholder-zinc-400 outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-zinc-400 hover:text-zinc-700 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto p-1 text-sm">
            {filtered.length === 0 ? (
              <div className="py-2.5 px-3 text-xs text-zinc-500 text-center">
                {allowCustom && search.trim() ? (
                  <button
                    type="button"
                    onClick={() => handleSelect(search.trim())}
                    className="w-full text-left py-1.5 px-2 rounded hover:bg-zinc-100 text-zinc-800 font-medium"
                  >
                    Use custom: &ldquo;<span className="text-blue-600">{search.trim()}</span>&rdquo;
                  </button>
                ) : (
                  "No matches found"
                )}
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const optVal = typeof opt === "string" ? opt : opt.value || opt.id;
                const optLabel = typeof opt === "string" ? opt : opt.label || opt.name || optVal;
                const isSelected = value === optVal;

                return (
                  <div
                    key={optVal || idx}
                    onClick={() => handleSelect(optVal)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-zinc-900 text-white font-medium"
                        : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <span className="truncate">{optLabel}</span>
                    {isSelected && <Check size={13} className="shrink-0 ml-2" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
