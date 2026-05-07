import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface Option {
    value: string | number;
    label: string;
}

interface CustomSelectProps {
    value: string | number;
    onChange: (val: string | number) => void;
    options: Option[];
    placeholder: string;
    disabled?: boolean;
    searchable?: boolean;
    forceDirection?: 'up' | 'down';
}

export function CustomSelect({
    value,
    onChange,
    options,
    placeholder,
    disabled,
    searchable = true,
    forceDirection
}: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [dropDirection, setDropDirection] = useState<'down' | 'up'>('down');

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (open && wrapperRef.current) {
            if (forceDirection) {
                setDropDirection(forceDirection);
                return;
            }
            const rect = wrapperRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const hasSpaceBelow = spaceBelow > 300; // 300px threshold for the dropdown list
            setDropDirection(hasSpaceBelow ? 'down' : 'up');
        }
    }, [open, forceDirection]);

    const selectedOption = options.find((o) => o.value === value);
    const selectedLabel = selectedOption?.label || '';

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.relatedTarget as Node)) {
            setOpen(false);
            setQuery('');
            setFocusedIndex(-1);
        }
    };

    const filteredOptions = query === ''
        ? options
        : options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()));

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
                setQuery('');
                setFocusedIndex(-1);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setFocusedIndex(-1);
    }, [query]);

    useEffect(() => {
        if (open && wrapperRef.current) {
            setTimeout(() => {
                wrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [open]);

    useEffect(() => {
        if (open && focusedIndex >= 0 && listRef.current) {
            const listElement = listRef.current;
            const focusedElement = listElement.children[focusedIndex] as HTMLElement;
            if (focusedElement) {
                const listTop = listElement.scrollTop;
                const listBottom = listTop + listElement.clientHeight;
                const elementTop = focusedElement.offsetTop;
                const elementBottom = elementTop + focusedElement.clientHeight;

                if (elementBottom > listBottom) {
                    listElement.scrollTop = elementBottom - listElement.clientHeight;
                } else if (elementTop < listTop) {
                    listElement.scrollTop = elementTop;
                }
            }
        }
    }, [focusedIndex, open]);

    const handleKeyDown = (e: React.KeyboardEvent<any>) => {
        if (disabled) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) {
                setOpen(true);
            } else {
                setFocusedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (open) {
                setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
                onChange(filteredOptions[focusedIndex].value);
                setOpen(false);
                setQuery('');
                setFocusedIndex(-1);
            } else if (!open) {
                setOpen(true);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setQuery('');
            setFocusedIndex(-1);
        }
    };

    return (
        <div
            className="relative"
            ref={wrapperRef}
            onBlur={handleBlur}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    if (!open) {
                        e.preventDefault();
                        setOpen(true);
                        if (searchable) {
                            setTimeout(() => inputRef.current?.focus(), 10);
                        }
                    }
                }
                if (open) handleKeyDown(e);
            }}
        >
            <div
                className={`flex items-center justify-between w-full rounded-xl border shadow-sm transition-all bg-gray-50 cursor-pointer overflow-hidden
                    ${open ? 'border-green-500 ring-4 ring-green-50' : 'border-gray-200'}
                    ${disabled ? 'opacity-60 cursor-not-allowed bg-gray-100' : 'hover:border-gray-300'}
                `}
                onClick={() => {
                    if (!disabled) {
                        const nextOpen = !open;
                        setOpen(nextOpen);
                        if (nextOpen && searchable) {
                            setTimeout(() => inputRef.current?.focus(), 10);
                        }
                    }
                }}
            >
                <div className="flex-1 relative">
                    {searchable && open ? (
                        <div className="flex items-center pl-3">
                            <Search size={16} className="text-gray-400 mr-2 shrink-0" />
                            <input
                                type="text"
                                className="w-full bg-transparent p-3 pl-0 text-base font-medium text-gray-900 outline-none"
                                placeholder="Pesquisar..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                ref={inputRef}
                            />
                        </div>
                    ) : (
                        <div className="p-3 pl-4 text-base font-medium text-gray-900 truncate">
                            {selectedLabel || <span className="text-gray-400 font-normal">{placeholder}</span>}
                        </div>
                    )}
                </div>
                <div className="pr-3 flex items-center">
                    <ChevronDown size={20} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {open && !disabled && (
                <ul
                    ref={listRef}
                    className={`absolute z-50 w-full bg-white shadow-2xl max-h-[220px] rounded-2xl text-base ring-1 ring-black ring-opacity-5 overflow-auto overflow-x-hidden focus:outline-none animate-in fade-in zoom-in duration-200 custom-scrollbar
                        ${dropDirection === 'up' ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'}
                    `}
                >
                    {filteredOptions.length === 0 ? (
                        <li className="px-4 py-3 text-gray-500 text-center text-sm">Nenhuma opção encontrada...</li>
                    ) : (
                        filteredOptions.map((opt, index) => (
                            <li
                                key={opt.value}
                                className={`px-4 py-2.5 cursor-pointer transition-colors text-sm font-medium
                                    ${opt.value === value ? 'bg-green-50 text-green-700' : 'text-gray-700'}
                                    ${focusedIndex === index ? 'bg-green-600 text-white' : 'hover:bg-gray-50'}
                                `}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(opt.value);
                                    setOpen(false);
                                    setQuery('');
                                    setFocusedIndex(-1);
                                }}
                                onMouseEnter={() => setFocusedIndex(index)}
                            >
                                {opt.label}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}
