require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const {writeBarcode}=require('zxing-wasm/full');
const {normalizeGtin,decodeBarcode}=require('../src/mealResolution/barcode');

const barcode=async(text,format,width)=>{
  const written=await writeBarcode(text,{format,scale:3});
  return sharp(Buffer.from(await written.image.arrayBuffer())).resize({width}).png().toBuffer();
};
// A cluttered 768x1024 scene like the app's uploads (gradient plus text-like noise).
const scene=async(width=768,height=1024)=>sharp({create:{width,height,channels:3,background:'#c8d2dc'}})
  .composite([{input:Buffer.from(`<svg width="${width}" height="${height}"><text x="40" y="120" font-size="64">Cheerios</text>
    <text x="60" y="300" font-size="40">Powered by Protein</text><rect x="100" y="420" width="400" height="300" fill="#8a5a3c"/></svg>`),left:0,top:0}])
  .jpeg({quality:85}).toBuffer();
const place=async(background,input,left,top)=>sharp(background).composite([{input,left,top}]).jpeg({quality:85}).toBuffer();

test('barcodes normalise to GTIN-14 and never lose a leading zero',()=>{
  assert.equal(normalizeGtin('016000229969','UPCA'),'00016000229969');
  assert.equal(normalizeGtin('0016000229969','EAN13'),'00016000229969','EAN-13 form of the same UPC matches');
  assert.equal(normalizeGtin('16000229969'),null,'a UPC stored as a number (leading zero lost) fails the check digit');
  assert.equal(normalizeGtin('016000229968','UPCA'),null,'wrong check digit');
  assert.equal(normalizeGtin('4006381333931','EAN13'),'04006381333931');
  assert.equal(normalizeGtin('96385074','EAN8'),'00000096385074');
  assert.equal(normalizeGtin('04252614','UPCE'),'00042100005264','UPC-E expands to its UPC-A');
  assert.equal(normalizeGtin('abc'),null);
});

test('a clear barcode decodes from the whole image quickly, including rotated',async()=>{
  const code=await barcode('016000229969','UPCA',420);
  const upright=await place(await scene(),code,170,760);
  const read=await decodeBarcode(upright);
  assert.deepEqual([read.gtin,read.method],['00016000229969','whole']);
  assert.ok(read.ms<1000,`took ${read.ms} ms`);
  const sideways=await sharp(upright).rotate(90).jpeg().toBuffer();
  assert.equal((await decodeBarcode(sideways)).gtin,'00016000229969');
});

test('EXIF orientation is applied before decoding',async()=>{
  const code=await barcode('4006381333931','EAN13',420);
  const photo=await sharp(await place(await scene(),code,170,760)).rotate(180).withMetadata({orientation:3}).jpeg().toBuffer();
  assert.equal((await decodeBarcode(photo)).gtin,'04006381333931');
});

test('a faint barcode under glare on a curved bottle decodes once the lighting is evened out',async()=>{
  // Meal 30384: a sideways kefir barcode, ~2 px per bar at upload size, on a white bottle over a dark floor. A tight
  // crop read it; the whole photo and the tiles did not, because each scan line's threshold also saw the floor.
  const code=await sharp(await barcode('017077109321','UPCA',190)).grayscale().linear(0.35,255*0.65)
    .rotate(90,{background:'#fff'}).png().toBuffer();
  const bottle=`<svg width="768" height="1024"><rect width="768" height="1024" fill="rgb(60,50,40)"/>
    <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#9aa"/></linearGradient></defs>
    <rect x="40" y="0" width="520" height="880" rx="120" fill="url(#g)"/>
    <text x="80" y="200" font-size="36" fill="#223">INGREDIENTS: LOWFAT MILK</text>
    <text x="80" y="620" font-size="28" fill="#223">LIFEWAY FOODS</text></svg>`;
  const photo=await sharp(Buffer.from(bottle)).composite([{input:code,left:400,top:560}]).jpeg({quality:85}).toBuffer();
  const read=await decodeBarcode(photo);
  assert.deepEqual([read.gtin,read.method],['00017077109321','flattened']);
  assert.ok(read.ms<3000,`took ${read.ms} ms`);
});

test('a photo without a barcode gives up fast and never asks the locator at upload size',async()=>{
  let located=0;
  const started=Date.now();
  assert.equal(await decodeBarcode(await scene(),{locate:async()=>{located++;return []}}),null);
  assert.ok(Date.now()-started<3000);
  assert.equal(located,0,'768x1024 uploads have no extra resolution for a located crop');
});

test('large photos use the locator box for a full-resolution crop',async()=>{
  const code=await barcode('016000229969','UPCA',260);
  const bg=await scene(3024,4032);
  const photo=await place(bg,await sharp(code).blur(0.6).rotate(8,{background:'#fff'}).toBuffer(),2150,2900);
  let boxes=0;
  const read=await decodeBarcode(photo,{locate:async(jpeg,width,height)=>{boxes++;const s=width/3024;
    return [{left:2150*s,top:2900*s,width:280*s,height:170*s}]}});
  assert.equal(read?.gtin,'00016000229969');
  assert.ok(['located','tiles','whole'].includes(read.method));
});

// Private fixtures: the user's own photos, read from a local directory, never committed.
const privateDir=process.env.AMINO_PRIVATE_PHOTOS;
test('real app photos decode as expected',{skip:!privateDir&&'Set AMINO_PRIVATE_PHOTOS to the private photo directory'},async()=>{
  const expected={'20260925230005755_jlv734j4.jpg':'00016000229969','20260925225645222_kufh1kry.jpg':null,'20260925230020223_a13zb1j1.jpg':null,
    // Meal 30384 (glare on a curved kefir bottle): only the flattened pass reads it.
    '20260930212026717_zmetilwj.jpg':'00017077109321'};
  for (const [file,gtin] of Object.entries(expected)) {
    const read=await decodeBarcode(fs.readFileSync(path.join(privateDir,file)));
    assert.equal(read?.gtin??null,gtin,file);
  }
});
