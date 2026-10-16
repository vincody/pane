const paths:Record<string,string> = {
  folder: 'M3 7V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  edit: 'm16 3 5 5 M4 20l4-1 13-13-4-4L4 15Z',
  write: 'M12 8v8 M8 12h8 M5 3h14v18H5Z',
  run: 'm5 5 7 7-7 7 M13 19h6',
  read: 'M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4Z M12 7v14',
  branch: 'M6 8v8 M18 8a6 6 0 0 1-6 6H6 M6 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M6 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6',
  'file-plus':'M14 2H6a2 2 0 0 0-2 2v16h16V8Z M14 2v6h6 M12 11v6 M9 14h6',
  'folder-plus':'M3 7V4h6l2 3h10v13H3Z M12 10v7 M8.5 13.5h7',
  copy:'M8 8h13v13H8Z M16 8V3H3v13h5',
  rename:'m15 4 5 5 M4 20l5-1L21 7l-5-5L4 14Z',
  trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  code: 'm8 8-4 4 4 4 m8-8 4 4-4 4 m-3-13-2 18',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z m-2 13 5-5 4 4 3-3 6 6 M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  markdown: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M6 15V9l3 3 3-3v6 m5-6v6 m-2-2 2 2 2-2',
  search: 'm21 21-4.3-4.3 M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
  panel: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M9 3v18',
  'panel-right': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M15 3v18',
  monitor: 'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M12 17v4 M8 21h8',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  settings: 'M10 2h4l.5 3 2 1 2.5-1.5 2 3.5-2.5 2v4l2.5 2-2 3.5-2.5-1.5-2 1-.5 3h-4l-.5-3-2-1L5 19.5 3 16l2.5-2v-4L3 8l2-3.5L7.5 6l2-1 .5-3Z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2l1 4 M4 12l1 4a8 8 0 0 0 13 2',
  plus: 'M12 5v14 M5 12h14',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18 M12 3c-5 5-5 13 0 18',
  chart: 'M4 4v16h16 M8 16v-5 M13 16V7 M18 16v-8',
  pet: 'M5 13V5l5 3h4l5-3v8a7 7 0 0 1-14 0Z M9 12h.01 M15 12h.01 M10 16h4',
  stop: 'M7 7h10v10H7Z',
  close: 'm6 6 12 12 M18 6 6 18',
  terminal: 'M4 5h16v14H4Z M7 9l3 3-3 3 M12 15h4',
  maximize: 'M8 3H3v5 M3 3l7 7 M16 21h5v-5 M21 21l-7-7',
  'chevron-right': 'm9 5 7 7-7 7',
  'chevron-up': 'm5 15 7-7 7 7',
  'chevron-down': 'm5 9 7 7 7-7',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.1.7-1.7 1.1-1.7 2.7 M12 17h.01',
  arrow: 'M7 17 17 7 M7 7h10v10',
};
export function icon(name = 'file') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', paths[name] || paths.file); svg.append(shape);
  svg.classList.add(`file-${name}`); return svg;
}
