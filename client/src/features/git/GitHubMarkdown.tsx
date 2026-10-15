import {marked} from 'marked';
import DOMPurify from 'dompurify';
export function Body({body}:{body:string}){return <div className="github-markdown" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(marked.parse(body||'_No description._',{async:false}),{FORBID_TAGS:['img','iframe','form','input','button','video','audio'],ADD_ATTR:['target']})}}/>;}
