import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

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
}

export function CustomSelect({ value, onChange, options, placeholder, disabled }: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    
    const wrapperRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selectedLabel = options.find((o) => o.value === value)?.label || '';

    // Filtra as opções
    const filteredOptions = query === ''
        ? options
        : options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()));

    // Opção extra para o "placeholder" (limpar seleção)
    const allOptions = [{ value: '', label: placeholder }, ...filteredOptions];

    // Fecha o dropdown se clicar fora
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

    // Reseta o foco quando a pesquisa muda
    useEffect(() => {
        setFocusedIndex(-1);
    }, [query]);

    // Rola a lista para mostrar o item focado
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) {
                setOpen(true);
            } else {
                setFocusedIndex((prev) => (prev < allOptions.length - 1 ? prev + 1 : prev));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (open) {
                setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && focusedIndex >= 0 && focusedIndex < allOptions.length) {
                onChange(allOptions[focusedIndex].value);
                setOpen(false);
                setQuery('');
                setFocusedIndex(-1);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setQuery('');
            setFocusedIndex(-1);
        }
    };

    return (
        <div className="relative mt-1" ref={wrapperRef}>
            <div className="relative w-full">
                <input
                    type="text"
                    disabled={disabled}
                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 truncate cursor-text"
                    placeholder={selectedLabel || placeholder}
                    value={open ? query : selectedLabel}
                    onFocus={() => { setOpen(true); setQuery(''); setFocusedIndex(-1); }}
                    onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
                    onKeyDown={handleKeyDown}
                />
                <button
                    type="button"
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 flex items-center pr-2"
                    onClick={() => {
                        if (!disabled) {
                            setOpen(!open);
                            if (!open) {
                                setQuery('');
                                setFocusedIndex(-1);
                            }
                        }
                    }}
                >
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>
            </div>

            {open && !disabled && (
                <ul 
                    ref={listRef}
                    className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-[40vh] rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
                >
                    {filteredOptions.length === 0 ? (
                        <li className="relative py-2 pl-3 pr-9 text-gray-500 select-none">Nenhuma opção encontrada...</li>
                    ) : (
                        allOptions.map((opt, index) => (
                            <li
                                key={opt.value === '' ? 'placeholder' : opt.value}
                                className={`text-gray-900 hover:cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-600 hover:text-white 
                                    ${opt.value === value && focusedIndex !== index ? 'bg-blue-50' : ''} 
                                    ${focusedIndex === index ? 'bg-blue-600 text-white' : ''}
                                `}
                                onClick={() => { onChange(opt.value); setOpen(false); setQuery(''); setFocusedIndex(-1); }}
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