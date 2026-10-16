const SEARCH_URL='https://www.google.com/search?q=';
const search=(value:string)=>`${SEARCH_URL}${encodeURIComponent(value)}`;
const PRIVATE_HOST=/^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?(?:[/?#].*)?$/;
function withScheme(value:string){
 if(/^https?:\/\//i.test(value)||value==='about:blank')return value;
 if(/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#].*)?$/i.test(value)||PRIVATE_HOST.test(value))return `http://${value}`;
 // javascript:, data:, file: and other schemes are never opened; they are searched like any other text.
 if(/^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(value))return search(value);
 if(/^[^\s/?#]+\.[^\s]+$/.test(value))return `https://${value}`;
 return search(value);
}
/** Address-bar text becomes an absolute http(s) URL; anything that is not an address is searched. Empty text stays empty. */
export function sanitizeUrl(input:string){
 const value=input.trim();if(!value)return '';
 const candidate=withScheme(value);
 return URL.canParse(candidate)?candidate:search(value);
}
export function describeLoadError(code:number,description:string){
 if(code===-102)return {title:'Connection refused',detail:'Nothing is accepting connections at this address. If it is a local server, check that it is running.'};
 if(code===-105)return {title:'Address not found',detail:'The host name could not be resolved. Check the spelling or your connection.'};
 if(code===-106||code===-21)return {title:'No internet connection',detail:'The network is unavailable or changed while the page was loading.'};
 if(code===-109)return {title:'Address unreachable',detail:'The address cannot be reached from this computer.'};
 if(code===-7||code===-118)return {title:'Connection timed out',detail:'The server took too long to respond.'};
 if(code===-20)return {title:'Blocked',detail:'Pages in the Browser tab cannot open Pane’s own local server.'};
 if(code===-324)return {title:'Empty response',detail:'The server closed the connection without sending anything.'};
 if(code<=-200&&code>=-299)return {title:'Certificate problem',detail:'The site’s security certificate is not trusted, so Pane did not open it.'};
 return {title:'This page could not be loaded',detail:description?description.replace(/^ERR_/,'').replaceAll('_',' ').toLowerCase():'Unknown error.'};
}
