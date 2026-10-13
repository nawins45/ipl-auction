import React, { useState, useEffect, useRef } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?<>{}[]';

export default function TextRandomizer({
    text = '',
    duration = 800,
    delay = 0,
    className = '',
    as: Tag = 'span',
    style = {},
    stagger = 30, // ms between each character resolving
}) {
    const [display, setDisplay] = useState('');
    const rafRef = useRef(null);
    const startRef = useRef(null);

    useEffect(() => {
        if (!text) {
            setDisplay('');
            return;
        }

        const totalLen = text.length;
        // Pre-fill with random chars
        setDisplay(text.split('').map(ch => ch === ' ' ? ' ' : CHARS[Math.floor(Math.random() * CHARS.length)]).join(''));

        const timeout = setTimeout(() => {
            startRef.current = performance.now();

            const animate = (now) => {
                const elapsed = now - startRef.current;
                const resolvedCount = Math.min(totalLen, Math.floor(elapsed / stagger));

                let result = '';
                for (let i = 0; i < totalLen; i++) {
                    if (text[i] === ' ') {
                        result += ' ';
                    } else if (i < resolvedCount) {
                        result += text[i];
                    } else {
                        result += CHARS[Math.floor(Math.random() * CHARS.length)];
                    }
                }
                setDisplay(result);

                if (resolvedCount < totalLen) {
                    rafRef.current = requestAnimationFrame(animate);
                } else {
                    setDisplay(text);
                }
            };

            rafRef.current = requestAnimationFrame(animate);
        }, delay);

        return () => {
            clearTimeout(timeout);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [text, duration, delay, stagger]);

    return (
        <Tag className={className} style={{ ...style, fontVariantNumeric: 'tabular-nums' }}>
            {display || text}
        </Tag>
    );
}
