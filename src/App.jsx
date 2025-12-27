import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, Plus, Minus, ArrowRight, FileCode, Check, X, RefreshCcw } from 'lucide-react';

// --- CONSTANTS & ALGORITHMS ---

const DITHER_METHODS = {
    NONE: 'Threshold (1-Bit)',
    FLOYD: 'Floyd-Steinberg',
    ATKINSON: 'Atkinson',
    SIERRA: 'Sierra Lite',
    BAYER2: 'Bayer Matrix 2x2',
    BAYER4: 'Bayer Matrix 4x4',
    BAYER8: 'Bayer Matrix 8x8',
    NOISE: 'Blue Noise',
    STRETCH: 'Stretch Error',
    JARVIS: 'Jarvis-Judice-Ninke'
};

const PALETTE_METHODS = {
    K_MEANS: 'K-Means Clustering',
    HISTOGRAM: 'Histogram Freq',
    MEDIAN_CUT: 'Median Cut (Wide)',
    EXTREME: 'Extremes',
    VARIDE: 'Varied Distribution',
    DISTANT: 'Max Distance',
    PRONOUNCED: 'Pronounced'
};

const PALETTE_PRESETS = {
    DEFAULT: { name: 'Basic (5 Colors)', colors: ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF'] },
    RAINBOW: { name: 'Rainbow (8 Colors)', colors: ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF'] },
    GAMEBOY: { name: 'Gameboy (GB)', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
    MAC_BW: { name: 'Classic Mac (1-Bit)', colors: ['#000000', '#FFFFFF'] },
    CGA_1: { name: 'CGA (Magenta/Cyan)', colors: ['#000000', '#55FFFF', '#FF55FF', '#FFFFFF'] },
    CGA_2: { name: 'CGA (Red/Green)', colors: ['#000000', '#55FF55', '#FF5555', '#FFFF55'] },
    VAPORWAVE: { name: 'Vaporwave', colors: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'] },
    NEON_NOIR: { name: 'Neon Noir', colors: ['#0b0c15', '#161b2d', '#232c45', '#ff0055', '#00e5ff', '#ffffff'] },
    SEPIA: { name: 'Sepia', colors: ['#2e211b', '#4d3930', '#805d46', '#bf9775', '#e6cbb3'] },
    C64: { name: 'Commodore 64', colors: ['#000000', '#FFFFFF', '#880000', '#AAFFEE', '#CC44CC', '#00CC55', '#0000AA', '#EEEE77', '#DD8855', '#664400', '#FF7777', '#333333', '#777777', '#AAFF66', '#0088FF', '#BBBBBB'] }
};

const BAYER_MATRIX_2 = [[0, 2], [3, 1]];
const BAYER_MATRIX_4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const BAYER_MATRIX_8 = [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]
];

// Helper to hex to rgb
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
};

// Helper: Find nearest color (Updated to Redmean for better accuracy)
const findNearestColor = (r, g, b, paletteRgb) => {
    let minDist = Infinity;
    let bestColor = paletteRgb[0];

    for (let i = 0; i < paletteRgb.length; i++) {
        const p = paletteRgb[i];
        const rMean = (r + p.r) / 2;
        const dR = r - p.r;
        const dG = g - p.g;
        const dB = b - p.b;

        // Redmean formula
        const weightR = 2 + rMean / 256;
        const weightG = 4.0;
        const weightB = 2 + (255 - rMean) / 256;

        const dist = weightR * dR * dR + weightG * dG * dG + weightB * dB * dB;

        if (dist < minDist) { minDist = dist; bestColor = p; }
    }
    return bestColor;
};

// Helper: Convert RGB object to Hex
const rgbToHex = (r, g, b) => {
    const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Helper: Truncate Filename
const truncateFilename = (str, maxLength = 12) => {
    if (str.length <= maxLength) return str;
    const left = Math.ceil(maxLength / 2);
    const right = Math.floor(maxLength / 2) - 1;
    return str.substr(0, left) + "..." + str.substr(str.length - right);
};

// --- PALETTE EXTRACTION ---
const extractPalette = (img, method, count = 5) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = 64;
    const h = 64;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 128) {
            pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }
    }

    if (pixels.length === 0) return PALETTE_PRESETS.DEFAULT.colors;

    let chosenColors = [];

    switch (method) {
        case 'HISTOGRAM': {
            const hist = {};
            pixels.forEach(p => {
                const key = `${p.r >> 4}|${p.g >> 4}|${p.b >> 4}`;
                if (!hist[key]) hist[key] = { count: 0, r: 0, g: 0, b: 0 };
                hist[key].count++;
                hist[key].r += p.r;
                hist[key].g += p.g;
                hist[key].b += p.b;
            });
            const buckets = Object.values(hist).map(b => ({
                r: b.r / b.count,
                g: b.g / b.count,
                b: b.b / b.count,
                count: b.count
            })).sort((a, b) => b.count - a.count);
            chosenColors = buckets.slice(0, count);
            break;
        }
        case 'K_MEANS': {
            let centroids = [];
            for (let i = 0; i < count; i++) centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);
            for (let iter = 0; iter < 5; iter++) {
                const clusters = Array(count).fill().map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
                pixels.forEach(p => {
                    let minDist = Infinity;
                    let idx = 0;
                    centroids.forEach((c, i) => {
                        const dist = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
                        if (dist < minDist) { minDist = dist; idx = i; }
                    });
                    clusters[idx].r += p.r;
                    clusters[idx].g += p.g;
                    clusters[idx].b += p.b;
                    clusters[idx].count++;
                });
                centroids = clusters.map(c => c.count > 0 ? { r: c.r / c.count, g: c.g / c.count, b: c.b / c.count } : { r: 0, g: 0, b: 0 });
            }
            chosenColors = centroids.filter(c => c.r !== undefined);
            break;
        }
        case 'EXTREME': {
            pixels.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
            const step = Math.floor(pixels.length / (count - 1));
            chosenColors.push(pixels[0]);
            for (let i = 1; i < count - 1; i++) chosenColors.push(pixels[i * step]);
            chosenColors.push(pixels[pixels.length - 1]);
            break;
        }
        case 'VARIDE': {
            chosenColors.push(pixels[Math.floor(Math.random() * pixels.length)]);
            let safeLimit = 0;
            while (chosenColors.length < count && safeLimit < 1000) {
                const candidate = pixels[Math.floor(Math.random() * pixels.length)];
                let minDist = Infinity;
                chosenColors.forEach(c => {
                    const dist = Math.sqrt((candidate.r - c.r) ** 2 + (candidate.g - c.g) ** 2 + (candidate.b - c.b) ** 2);
                    if (dist < minDist) minDist = dist;
                });
                if (minDist > 50) chosenColors.push(candidate);
                safeLimit++;
            }
            while (chosenColors.length < count) chosenColors.push(pixels[Math.floor(Math.random() * pixels.length)]);
            break;
        }
        case 'DISTANT': {
            chosenColors.push(pixels[Math.floor(Math.random() * pixels.length)]);
            for (let k = 1; k < count; k++) {
                let maxDist = -1;
                let bestP = pixels[0];
                for (let s = 0; s < 200; s++) {
                    const p = pixels[Math.floor(Math.random() * pixels.length)];
                    let minDist = Infinity;
                    chosenColors.forEach(c => {
                        const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
                        if (d < minDist) minDist = d;
                    });
                    if (minDist > maxDist) { maxDist = minDist; bestP = p; }
                }
                chosenColors.push(bestP);
            }
            break;
        }
        case 'PRONOUNCED': {
            const satPixels = pixels.filter(p => {
                const max = Math.max(p.r, p.g, p.b);
                const min = Math.min(p.r, p.g, p.b);
                const delta = max - min;
                return delta > 50;
            });
            const source = satPixels.length > 100 ? satPixels : pixels;
            const hist = {};
            source.forEach(p => {
                const key = `${p.r >> 5}|${p.g >> 5}|${p.b >> 5}`;
                if (!hist[key]) hist[key] = { count: 0, r: 0, g: 0, b: 0 };
                hist[key].count++;
                hist[key].r += p.r;
                hist[key].g += p.g;
                hist[key].b += p.b;
            });
            const buckets = Object.values(hist).map(b => ({
                r: b.r / b.count,
                g: b.g / b.count,
                b: b.b / b.count,
                count: b.count
            })).sort((a, b) => b.count - a.count);
            chosenColors = buckets.slice(0, count);
            break;
        }
        case 'MEDIAN_CUT':
        default: {
            // Enhanced Priority-Queue Median Cut to ensure we get exactly 'count' representatives 
            // that cover the widest ranges (fixing the "too tight" issue)
            let boxes = [{ pixels: pixels }];

            const getRange = (px) => {
                if (px.length === 0) return 0;
                let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
                px.forEach(p => {
                    minR = Math.min(minR, p.r); maxR = Math.max(maxR, p.r);
                    minG = Math.min(minG, p.g); maxG = Math.max(maxG, p.g);
                    minB = Math.min(minB, p.b); maxB = Math.max(maxB, p.b);
                });
                return Math.max(maxR - minR, maxG - minG, maxB - minB);
            };

            // Assign initial range
            boxes[0].range = getRange(boxes[0].pixels);

            while (boxes.length < count) {
                // Split the box with the largest range
                boxes.sort((a, b) => b.range - a.range);
                const box = boxes.shift();
                const px = box.pixels;

                if (px.length === 0) {
                    boxes.push(box);
                    break;
                }

                // Find largest dimension to split
                let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
                px.forEach(p => {
                    minR = Math.min(minR, p.r); maxR = Math.max(maxR, p.r);
                    minG = Math.min(minG, p.g); maxG = Math.max(maxG, p.g);
                    minB = Math.min(minB, p.b); maxB = Math.max(maxB, p.b);
                });
                const rR = maxR - minR, rG = maxG - minG, rB = maxB - minB;
                const maxRange = Math.max(rR, rG, rB);
                const sortChannel = maxRange === rG ? 'g' : (maxRange === rB ? 'b' : 'r');

                px.sort((a, b) => a[sortChannel] - b[sortChannel]);
                const mid = Math.floor(px.length / 2);

                const p1 = px.slice(0, mid);
                const p2 = px.slice(mid);

                boxes.push({ pixels: p1, range: getRange(p1) });
                boxes.push({ pixels: p2, range: getRange(p2) });
            }

            chosenColors = boxes.map(b => {
                if (b.pixels.length === 0) return { r: 0, g: 0, b: 0 };
                const sum = b.pixels.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), { r: 0, g: 0, b: 0 });
                return {
                    r: Math.round(sum.r / b.pixels.length),
                    g: Math.round(sum.g / b.pixels.length),
                    b: Math.round(sum.b / b.pixels.length)
                };
            });
            break;
        }
    }

    const hexColors = chosenColors.map(c => rgbToHex(c.r, c.g, c.b)).filter((v, i, a) => a.indexOf(v) === i);
    while (hexColors.length < count) hexColors.push('#FFFFFF');
    return hexColors.slice(0, count);
};


// --- UI COMPONENTS ---

const ToggleRow = ({ label, value, subLabel, control }) => (
    <div className="flex items-center justify-between py-4 border-b border-black last:border-0">
        <div className="flex flex-col">
            <span className="text-sm font-bold uppercase tracking-wider text-[#111]">{label}</span>
            {subLabel && <span className="text-[10px] text-gray-500 font-mono mt-0.5">{subLabel}</span>}
        </div>
        <div className="flex items-center gap-3">
            {value !== undefined && <span className="font-mono text-xs font-bold mr-2">{value}</span>}
            {control}
        </div>
    </div>
);

const ToggleSwitch = ({ active, onToggle, labelOn = "ON", labelOff = "OFF" }) => (
    <button
        onClick={onToggle}
        className={`h-8 px-1 rounded-full border border-black flex items-center transition-all ${active ? 'bg-black w-20 justify-end' : 'bg-transparent w-20 justify-start'}`}
    >
        <span className={`text-[9px] font-bold mx-2 ${active ? 'text-white' : 'text-black'}`}>{active ? labelOn : labelOff}</span>
        <div className={`w-6 h-6 rounded-full border border-black transition-all ${active ? 'bg-white' : 'bg-transparent'}`}></div>
    </button>
);

const RangeSlider = ({ value, min, max, onChange, className = "" }) => (
    <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-32 h-2 bg-black/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all ${className}`}
    />
);

const InfoCard = ({ title, value, sub, action, className = "" }) => (
    <div className={`border border-black rounded-[2rem] p-5 flex flex-col justify-between h-40 relative bg-transparent ${className}`}>
        <div>
            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1 block">{title}</span>
            <div className="text-2xl font-normal leading-none tracking-tight break-all">{value}</div>
            {sub && <div className="text-[10px] text-gray-500 mt-1">{sub}</div>}
        </div>
        {action}
    </div>
);

const SliderCard = ({ title, value, min, max, onChange, className = "" }) => (
    <div className={`border border-black rounded-[2rem] p-5 flex flex-col justify-center relative bg-transparent ${className}`}>
        <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">{title}</span>
            <span className="text-lg font-bold">{value}</span>
        </div>
        <RangeSlider value={value} min={min} max={max} onChange={onChange} className="w-full" />
    </div>
);

// --- MAIN APP ---

export default function App() {
    const [image, setImage] = useState(null);
    const [fileName, setFileName] = useState('No File');
    const [mode, setMode] = useState('bw');
    const [outputWidth, setOutputWidth] = useState(600);
    const [pixelSize, setPixelSize] = useState(4);
    const [threshold, setThreshold] = useState(128);
    const [blur, setBlur] = useState(0);
    const [colorDepth, setColorDepth] = useState(8);
    const [ditherMethod, setDitherMethod] = useState('FLOYD');
    const [paletteMethod, setPaletteMethod] = useState('MEDIAN_CUT');

    // Extracted palette is stored separately so we can revert to it
    const [savedPalette, setSavedPalette] = useState(PALETTE_PRESETS.DEFAULT.colors);
    const [palette, setPalette] = useState(PALETTE_PRESETS.DEFAULT.colors);

    const [isProcessing, setIsProcessing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [processedData, setProcessedData] = useState(null);
    const [zoom, setZoom] = useState(1);

    const fileInputRef = useRef(null);
    const processingTimerRef = useRef(null);

    // Initial Palette Extraction (Updates Saved Palette)
    useEffect(() => {
        if (mode === 'color' && image) {
            const extracted = extractPalette(image, paletteMethod, 5);
            setSavedPalette(extracted);
            setPalette(extracted); // Default to using it immediately
        } else if (mode === 'bw') {
            setPalette(['#000000', '#FFFFFF']);
        }
    }, [mode, paletteMethod, image]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => { setImage(img); setZoom(0.8); };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    const updateColor = (index, val) => {
        const newPal = [...palette];
        newPal[index] = val;
        setPalette(newPal);
    };

    const addColor = () => setPalette([...palette, '#888888']);

    const removeColor = (index) => {
        if (palette.length <= 1) return;
        const newPal = [...palette];
        newPal.splice(index, 1);
        setPalette(newPal);
    };

    const processImage = useCallback(() => {
        if (!image) return;
        setIsProcessing(true);

        if (processingTimerRef.current) clearTimeout(processingTimerRef.current);

        processingTimerRef.current = setTimeout(() => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const aspect = image.height / image.width;
                const ditherW = Math.max(1, Math.floor(outputWidth / pixelSize));
                const ditherH = Math.round(ditherW * aspect);

                canvas.width = ditherW;
                canvas.height = ditherH;
                ctx.clearRect(0, 0, ditherW, ditherH);

                if (blur > 0) ctx.filter = `blur(${blur}px)`;
                ctx.drawImage(image, 0, 0, ditherW, ditherH);
                ctx.filter = 'none';

                const imgData = ctx.getImageData(0, 0, ditherW, ditherH);
                const data = imgData.data;
                const width = imgData.width;
                const height = imgData.height;
                const paletteRgb = palette.map(hex => ({ ...hexToRgb(hex), hex }));
                const floatBuffer = new Float32Array(width * height * 4);

                const levels = Math.pow(2, colorDepth);
                const step = 255 / (levels - 1);

                for (let i = 0; i < width * height; i++) {
                    let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];

                    if (colorDepth < 8) {
                        r = Math.round(Math.round(r / step) * step);
                        g = Math.round(Math.round(g / step) * step);
                        b = Math.round(Math.round(b / step) * step);
                    }

                    floatBuffer[i * 4] = r;
                    floatBuffer[i * 4 + 1] = g;
                    floatBuffer[i * 4 + 2] = b;
                    floatBuffer[i * 4 + 3] = a;
                }

                const addErr = (x, y, errR, errG, errB, factor) => {
                    if (x < 0 || x >= width || y < 0 || y >= height) return;
                    const idx = (y * width + x) * 4;
                    if (floatBuffer[idx + 3] < 128) return;
                    floatBuffer[idx] += errR * factor;
                    floatBuffer[idx + 1] += errG * factor;
                    floatBuffer[idx + 2] += errB * factor;
                };

                const userBias = threshold - 128;
                const clamp = (v) => Math.max(0, Math.min(255, v));

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        if (floatBuffer[idx + 3] < 128) {
                            data[idx] = data[idx + 1] = data[idx + 2] = data[idx + 3] = 0;
                            continue;
                        }

                        // CLAMP INPUT TO PREVENT RUNAWAY ERROR
                        let oldR = clamp(floatBuffer[idx]);
                        let oldG = clamp(floatBuffer[idx + 1]);
                        let oldB = clamp(floatBuffer[idx + 2]);

                        let newR, newG, newB;

                        let ditherBias = 0;
                        if (ditherMethod.startsWith('BAYER')) {
                            let matrix, dim;
                            if (ditherMethod === 'BAYER2') { matrix = BAYER_MATRIX_2; dim = 2; }
                            else if (ditherMethod === 'BAYER4') { matrix = BAYER_MATRIX_4; dim = 4; }
                            else { matrix = BAYER_MATRIX_8; dim = 8; }
                            const limit = dim * dim;
                            const rawMap = matrix[y % dim][x % dim] / limit;
                            ditherBias = (rawMap - 0.5) * 64;
                        } else if (ditherMethod === 'NOISE') {
                            ditherBias = (Math.random() - 0.5) * 64;
                        }

                        if (mode === 'bw') {
                            const gray = (oldR * 0.299 + oldG * 0.587 + oldB * 0.114);
                            const val = (gray + ditherBias + userBias) > 128 ? 255 : 0;
                            newR = newG = newB = val;
                        } else {
                            const effectiveR = clamp(oldR + ditherBias + userBias);
                            const effectiveG = clamp(oldG + ditherBias + userBias);
                            const effectiveB = clamp(oldB + ditherBias + userBias);

                            const nearest = findNearestColor(effectiveR, effectiveG, effectiveB, paletteRgb);
                            newR = nearest.r; newG = nearest.g; newB = nearest.b;
                        }

                        if (!ditherMethod.startsWith('BAYER') && ditherMethod !== 'NOISE' && ditherMethod !== 'NONE') {
                            const effectiveTargetR = clamp(oldR + userBias);
                            const effectiveTargetG = clamp(oldG + userBias);
                            const effectiveTargetB = clamp(oldB + userBias);

                            const errR = effectiveTargetR - newR;
                            const errG = effectiveTargetG - newG;
                            const errB = effectiveTargetB - newB;

                            if (ditherMethod === 'FLOYD') {
                                addErr(x + 1, y, errR, errG, errB, 7 / 16); addErr(x - 1, y + 1, errR, errG, errB, 3 / 16); addErr(x, y + 1, errR, errG, errB, 5 / 16); addErr(x + 1, y + 1, errR, errG, errB, 1 / 16);
                            } else if (ditherMethod === 'ATKINSON') {
                                addErr(x + 1, y, errR, errG, errB, 1 / 8); addErr(x + 2, y, errR, errG, errB, 1 / 8); addErr(x - 1, y + 1, errR, errG, errB, 1 / 8); addErr(x, y + 1, errR, errG, errB, 1 / 8); addErr(x + 1, y + 1, errR, errG, errB, 1 / 8); addErr(x, y + 2, errR, errG, errB, 1 / 8);
                            } else if (ditherMethod === 'SIERRA') {
                                addErr(x + 1, y, errR, errG, errB, 2 / 4); addErr(x - 1, y + 1, errR, errG, errB, 1 / 4); addErr(x, y + 1, errR, errG, errB, 1 / 4);
                            } else if (ditherMethod === 'STRETCH') {
                                addErr(x + 1, y, errR, errG, errB, 1.0);
                            }
                        }

                        data[idx] = newR; data[idx + 1] = newG; data[idx + 2] = newB; data[idx + 3] = 255;
                    }
                }

                setProcessedData({ data: data, width: width, height: height });

                ctx.putImageData(imgData, 0, 0);

                const previewCanvas = document.createElement('canvas');
                const previewW = outputWidth;
                const previewH = Math.round(outputWidth * aspect);
                previewCanvas.width = previewW;
                previewCanvas.height = previewH;
                const pCtx = previewCanvas.getContext('2d');
                pCtx.imageSmoothingEnabled = false;
                pCtx.drawImage(canvas, 0, 0, previewW, previewH);
                setPreviewUrl(previewCanvas.toDataURL());
                setIsProcessing(false);

            } catch (e) { console.error(e); setIsProcessing(false); }
        }, 50);
    }, [image, outputWidth, pixelSize, threshold, blur, colorDepth, ditherMethod, palette, mode]);

    useEffect(() => { processImage(); }, [processImage]);

    const downloadPNG = () => {
        if (!previewUrl) return;
        const link = document.createElement('a');
        link.download = `bitmap_${Date.now()}.png`;
        link.href = previewUrl;
        link.click();
    };

    const downloadSVG = () => {
        if (!processedData) return;
        const { data, width, height } = processedData;
        const colorGroups = {};
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
                if (a === 0) continue;
                const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
                if (!colorGroups[hex]) colorGroups[hex] = [];
                colorGroups[hex].push(`<rect x="${x}" y="${y}" width="1" height="1" />`);
            }
        }
        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`;
        Object.keys(colorGroups).forEach(color => {
            svgContent += `<g fill="${color}">` + colorGroups[color].join('') + `</g>`;
        });
        svgContent += `</svg>`;
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `bitmap_${Date.now()}.svg`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-[#F1F3EB] text-[#111] font-mono flex flex-col md:flex-row overflow-hidden">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
                body { font-family: 'Space Mono', monospace; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #000; border-radius: 4px; }
            `}</style>

            {/* --- LEFT PANEL: CONTROL (Scrollable on Desktop, First on Mobile) --- */}
            <div className="w-full md:w-[460px] flex-shrink-0 flex flex-col border-r border-black h-auto md:h-screen overflow-y-auto bg-[#F1F3EB] z-20 shadow-[5px_0px_20px_rgba(0,0,0,0.05)]">
                <div className="p-4 md:p-8 pb-32">

                    {/* Header Block (Cleaned) */}
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-4xl font-normal tracking-tight">Bitmap Fono</h1>
                        </div>
                    </div>

                    {/* Info Grid (Source & Output) */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <InfoCard
                            title="SOURCE FILE"
                            value={truncateFilename(fileName)}
                            sub={image ? `${image.width}x${image.height}px` : "Empty"}
                            action={
                                <button onClick={() => fileInputRef.current.click()} className="mt-auto self-start border border-black rounded-full px-4 py-1.5 text-[10px] font-bold uppercase hover:bg-black hover:text-white transition-colors">
                                    {image ? 'Replace' : 'Upload'}
                                </button>
                            }
                        />
                        <InfoCard
                            title="OUTPUT WIDTH"
                            value={`${outputWidth}px`}
                            action={
                                <div className="flex gap-2 mt-auto">
                                    <button onClick={() => setOutputWidth(w => Math.max(100, w - 50))} className="w-8 h-8 rounded-full border border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors"><Minus size={12} /></button>
                                    <button onClick={() => setOutputWidth(w => Math.min(2000, w + 50))} className="w-8 h-8 rounded-full border border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors"><Plus size={12} /></button>
                                </div>
                            }
                        />
                    </div>

                    {/* New Bit Size / Block Size Slider Card */}
                    <div className="mb-8">
                        <SliderCard
                            title="BIT SIZE (BLOCKINESS)"
                            value={pixelSize}
                            min={1}
                            max={64}
                            onChange={setPixelSize}
                        />
                    </div>

                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleImageUpload} />

                    {/* Settings Panel (Configuration) */}
                    <div>
                        <div className="text-[10px] font-bold uppercase text-gray-500 tracking-widest mb-2 px-1">+ CONFIGURATION</div>
                        <div className="border-t border-black">
                            <ToggleRow
                                label="COLOR MODE"
                                control={<ToggleSwitch active={mode === 'color'} onToggle={() => setMode(mode === 'bw' ? 'color' : 'bw')} labelOn="COL" labelOff="BW" />}
                            />

                            <ToggleRow
                                label="THRESHOLD"
                                value={threshold}
                                control={<RangeSlider value={threshold} min={0} max={255} onChange={setThreshold} />}
                            />

                            <ToggleRow
                                label="SIGNAL BLUR"
                                value={blur}
                                control={<RangeSlider value={blur} min={0} max={100} onChange={setBlur} />}
                            />

                            <ToggleRow
                                label="BIT DEPTH"
                                value={colorDepth}
                                control={<RangeSlider value={colorDepth} min={1} max={8} onChange={setColorDepth} />}
                            />

                            {/* Dropdowns */}
                            <div className="flex flex-col py-4 border-b border-black">
                                <span className="text-sm font-bold uppercase tracking-wider mb-2">ALGORITHM</span>
                                <div className="relative">
                                    <select
                                        value={ditherMethod}
                                        onChange={(e) => setDitherMethod(e.target.value)}
                                        className="w-full bg-transparent border border-black rounded-[1rem] px-4 py-3 font-bold text-xs uppercase appearance-none cursor-pointer hover:bg-black/5"
                                    >
                                        {Object.entries(DITHER_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                    <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} />
                                </div>
                            </div>

                            {mode === 'color' && (
                                <div className="flex flex-col py-4 border-b border-black animate-in fade-in slide-in-from-top-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold uppercase tracking-wider">PALETTE ({palette.length})</span>
                                            {/* Restore Button: Shows only if current palette != savedPalette */}
                                            {JSON.stringify(palette) !== JSON.stringify(savedPalette) && (
                                                <button
                                                    onClick={() => setPalette(savedPalette)}
                                                    className="flex items-center gap-1 text-[9px] font-bold bg-black text-white px-2 py-0.5 rounded-full hover:bg-gray-800 transition-colors"
                                                    title="Revert to Extracted"
                                                >
                                                    <RefreshCcw size={8} /> RESTORE EXTRACTED
                                                </button>
                                            )}
                                        </div>
                                        <button
                                            onClick={addColor}
                                            className="w-6 h-6 flex items-center justify-center border border-black rounded-full hover:bg-black hover:text-white transition-colors"
                                            title="Add Color"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>

                                    {/* Palette Preset Dropdown */}
                                    <div className="relative mb-3">
                                        <select
                                            onChange={(e) => setPalette(PALETTE_PRESETS[e.target.value].colors)}
                                            className="w-full bg-transparent border border-black rounded-[1rem] px-4 py-3 font-bold text-xs uppercase appearance-none cursor-pointer hover:bg-black/5"
                                            defaultValue="DEFAULT"
                                        >
                                            {Object.entries(PALETTE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                                        </select>
                                        <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" size={16} />
                                    </div>

                                    <select
                                        value={paletteMethod}
                                        onChange={(e) => setPaletteMethod(e.target.value)}
                                        className="w-full bg-transparent border border-black rounded-[1rem] px-4 py-3 font-bold text-xs uppercase appearance-none cursor-pointer hover:bg-black/5 mb-3"
                                    >
                                        {Object.entries(PALETTE_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>

                                    <div className="flex h-12 w-full border border-black rounded-[1rem] overflow-hidden relative">
                                        {palette.map((c, i) => (
                                            <div key={i} className="flex-grow h-full relative group">
                                                <div className="absolute inset-0" style={{ backgroundColor: c }}></div>
                                                <input
                                                    type="color"
                                                    value={c}
                                                    onChange={(e) => updateColor(i, e.target.value)}
                                                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                                                    title="Click to edit color"
                                                />
                                                {palette.length > 1 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeColor(i); }}
                                                        className="absolute top-0 right-0 m-1 bg-black/50 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-500 pointer-events-none group-hover:pointer-events-auto"
                                                        title="Remove color"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Export Buttons */}
                    <div className="flex flex-col gap-2 mt-8">
                        <button
                            onClick={downloadPNG}
                            disabled={!previewUrl}
                            className="w-full bg-black text-[#F1F3EB] h-14 rounded-[2rem] font-bold text-sm uppercase flex items-center justify-between px-6 hover:scale-[1.02] active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <span>EXPORT IMAGE (PNG)</span>
                            <div className="bg-[#F1F3EB] text-black rounded-full p-2">
                                <Download size={16} />
                            </div>
                        </button>

                        <button
                            onClick={downloadSVG}
                            disabled={!processedData}
                            className="w-full bg-transparent border border-black text-black h-12 rounded-[2rem] font-bold text-xs uppercase flex items-center justify-between px-6 hover:bg-black hover:text-[#F1F3EB] transition-all disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <span>EXPORT VECTOR (SVG)</span>
                            <FileCode size={16} />
                        </button>
                    </div>

                </div>
            </div>

            {/* --- RIGHT PANEL: ART VIEWING (Responsive) --- */}
            <div className="flex-1 bg-[#E6E8E1] relative flex items-center justify-center p-4 md:p-12 overflow-hidden min-h-[50vh]">

                {/* Decorative Grid */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
                </div>

                {/* Art Frame */}
                <div className="relative max-w-full max-h-full flex flex-col items-center justify-center w-full h-full">
                    {image ? (
                        <div className="relative shadow-xl border border-black/10 bg-white p-2 transition-transform duration-200 ease-out" style={{ transform: `scale(${zoom})` }}>
                            <img
                                src={previewUrl}
                                alt="Processed Art"
                                className="max-w-full max-h-[80vh] object-contain"
                                style={{ imageRendering: 'pixelated' }}
                            />
                            {/* Floating Zoom Controls */}
                            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex gap-4 bg-[#F1F3EB] border border-black rounded-full px-4 py-2 shadow-xl z-20">
                                <button onClick={() => setZoom(Math.max(0.1, zoom - 0.2))}><Minus size={14} /></button>
                                <span className="text-xs font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
                                <button onClick={() => setZoom(Math.min(4, zoom + 0.2))}><Plus size={14} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center opacity-30 flex flex-col items-center gap-4">
                            <div className="w-32 h-32 border-2 border-black rounded-full flex items-center justify-center border-dashed animate-[spin_10s_linear_infinite]">
                                <ImageIcon size={48} strokeWidth={1} />
                            </div>
                            <h2 className="text-xl font-bold uppercase tracking-widest">Awaiting Signal</h2>
                            <p className="font-mono text-xs">Upload an image to begin processing</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
