import { deflateRawSync } from "node:zlib";
type Cell = string | number | null | undefined;
type Sheet = { name: string; rows: Cell[][]; widths?: number[] };
const xml = (value: unknown) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"").slice(0,32767).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const crcTable = Array.from({length:256},(_,n) => { for(let k=0;k<8;k++) n=(n&1) ? 0xedb88320^(n>>>1) : n>>>1; return n>>>0; });
function crc32(bytes: Buffer) { let crc=0xffffffff;for(const byte of bytes) crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0; }
function zip(files: Record<string,string>) {
  const entries: Buffer[] = [],central: Buffer[] = [];let offset=0;
  for(const [name,value] of Object.entries(files)) {
    const filename=Buffer.from(name),bytes=Buffer.from(value),packed=deflateRawSync(bytes),crc=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
    const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);
    directory.writeUInt32LE(crc,16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
    entries.push(local,filename,packed);central.push(directory,filename);offset+=local.length+filename.length+packed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...entries,directory,end]);
}
function column(index: number) { let result="";for(index++;index>0;index=Math.floor((index-1)/26)) result=String.fromCharCode(65+(index-1)%26)+result;return result; }
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
export function createExcel(sheets: Sheet[]) {
  const files: Record<string,string> = {};
  files["[Content_Types].xml"]='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>';
  files["_rels/.rels"]='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files["xl/workbook.xml"]='<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>';
  files["xl/_rels/workbook.xml.rels"]='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  files["xl/styles.xml"]='<styleSheet xmlns="'+ns+'"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE5EF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  for(const [i,sheet] of sheets.entries()) {
    if(sheet.rows.length>1048576) throw new Error("Excel 单页超过行数上限，请缩小时间范围");
    const columns=sheet.rows.reduce((max,row)=>Math.max(max,row.length),1);
    const rows=sheet.rows.map((row,index)=>'<row r="'+(index+1)+'">'+row.map((value,j)=>{const ref=column(j)+(index+1),style=index===0?' s="1"':"";return typeof value==="number" && Number.isFinite(value) ? '<c r="'+ref+'"'+style+'><v>'+value+'</v></c>' : '<c r="'+ref+'" t="inlineStr"'+style+'><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';}).join("")+'</row>').join("");
    files["xl/worksheets/sheet"+(i+1)+".xml"]='<worksheet xmlns="'+ns+'"><dimension ref="A1:'+column(columns-1)+Math.max(1,sheet.rows.length)+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+Array.from({length:columns},(_,j)=>'<col min="'+(j+1)+'" max="'+(j+1)+'" width="'+(sheet.widths?.[j] ?? 18)+'" customWidth="1"/>').join("")+'</cols><sheetData>'+rows+'</sheetData><autoFilter ref="A1:'+column(columns-1)+Math.max(1,sheet.rows.length)+'"/></worksheet>';
  }
  return zip(files);
}
