import { useState, useRef, useEffect, type FocusEvent } from 'react';
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
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selectedLabel = options.find((o) => o.value === value)?.label || '';
    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.relatedTarget as Node)) {
            setOpen(false);
            setQuery('');
            setFocusedIndex(-1);
        }
    };
    // Filtra as opÃ§Ãµes
    const filteredOptions = query === ''
        ? options
        : options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()));

    // Não incluir o placeholder nas opções; placeholder só aparece no input quando não há seleção.
    const allOptions = filteredOptions;

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
        <div className="relative" ref={wrapperRef} onBlur={handleBlur} tabIndex={-1}>
            <div className="relative w-full">
                <input
                    type="text"
                    disabled={disabled}
                    className="w-full rounded-lg border border-gray-300 shadow-sm focus:ring-1 focus:border-teal-500 focus:ring-teal-500 p-2.5 pl-3 pr-10 text-left bg-white text-base disabled:bg-gray-100 disabled:opacity-75 truncate cursor-text disabled:cursor-not-allowed text-gray-900 placeholder:text-gray-500 font-normal outline-none"
                    placeholder={selectedLabel || placeholder}
                    value={open ? query : selectedLabel}
                    onFocus={() => { setOpen(true); setQuery(''); setFocusedIndex(-1); }}
                        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
                    onKeyDown={handleKeyDown}
                    ref={inputRef}
                />
                <button
                    type="button"
                    disabled={disabled}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 disabled:cursor-not-allowed"
                    onClick={() => {
                        if (!disabled) {
                            const nextOpen = !open;
                            setOpen(nextOpen);
                            if (nextOpen) {
                                setQuery('');
                                setFocusedIndex(-1);
                                inputRef.current?.focus();
                            }
                        }
                    }}
                >
                    <ChevronDown className="h-5 w-5 text-gray-600" strokeWidth={1.5} />
                </button>
            </div>

            {open && !disabled && (
                <ul ref={listRef} className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-[35vh] rounded-lg py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                {filteredOptions.length === 0 ? (
                    <li className="relative py-2.5 pl-3 pr-9 text-gray-500 select-none text-base font-normal">Nenhuma opção encontrada...</li>
                ) : (
                    allOptions.map((opt, index) => (
                        <li
                            key={opt.value === '' ? 'placeholder' : opt.value}
                            className={`font-normal text-base hover:cursor-pointer select-none relative py-2.5 pl-3 pr-9 transition-colors
                                ${opt.value === value && focusedIndex !== index ? 'bg-teal-50 text-teal-900 font-medium' : 'text-gray-900'}
                                ${focusedIndex === index ? 'bg-teal-600 text-white' : 'hover:bg-teal-50 hover:text-teal-900'}
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
