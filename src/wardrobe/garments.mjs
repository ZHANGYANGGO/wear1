// The display and source images are distinct from future template-specific try-on assets.
export const garmentCatalog = [
  garment('navy-shirt', '深蓝色短袖衬衫', 'top', '深蓝', '黑色', '通勤、几何暗纹、短袖',
    'spring、summer', 1, 'accent', '16dabf30e6e8fa3c96de5768fc31f823',
    '8a47422a764b0d7a99c00ffe356e7e912662a9968aa24eb0ad16d1ff8fb7fe3c'),
  garment('nude-pumps', '裸色尖头高跟鞋', 'shoes', '裸杏色', '', '通勤、尖头、细跟',
    'spring、summer、autumn', 1, 'accent', '272c3440b02e789f87eb2d0a383e2a11',
    '4984350f77f248011f9ff3ca94dfaffd25dc9224637dfc724f82aad06e67318a'),
  garment('floral-maxi', '白色碎花长裙', 'dress', '白色', '蓝色、绿色、浅黄、淡粉', '度假、碎花、方领、长裙',
    'spring、summer', 1, 'statement', '31e4250e21f793a2917dc58715075741',
    '5bce5f9745a90fe6ef14167a8a39cb20a614dbee9c81666b4d7406e0cc0b5291'),
  garment('white-sweatshirt', '白色宽松卫衣', 'top', '白色', '浅灰', '休闲、圆领、落肩、胸口线描',
    'spring、autumn', 2, 'basic', '32781bf929015783b27f24d0d69f3292',
    '7e1a99d66e872ee6400135bcab38972cd3cdfac8a02d17cc3aa93dda2abc0d98'),
  garment('black-trousers', '黑色直筒裤', 'bottom', '黑色', '', '通勤、高腰、直筒',
    'spring、autumn、winter', 2, 'basic', '3664b3d6eb66ec09e34ce78ab48204c3',
    '9541d01587e31972a26ae1ccd1c128aacd908d9bfe5074806b6accc73f703459'),
  garment('ivory-mary-janes', '米白色玛丽珍鞋', 'shoes', '米白色', '暖棕', '复古、细带、低方跟',
    'spring、summer、autumn', 1, 'accent', '39fac26a14d6cd1b7d173756751136d2',
    '01445dc0d4768fef493983d4f79e37585a31509f9e2929fb997ba5e040801c9d'),
  garment('blue-collar-polo', '米白色拼浅蓝翻领上衣', 'top', '米白色', '浅蓝色', '学院、撞色、翻领',
    'spring、summer', 1, 'accent', '577805cad80d5445a78439e07346156f',
    '6c3f99864bb200f62752f5f5d21be06feb77b8d6e8113ca89a2c9ea0fbdf7729'),
  garment('gray-joggers', '浅灰色直腿运动裤', 'bottom', '浅灰', '', '运动、松紧腰、宽腿',
    'spring、autumn', 2, 'basic', '7b2cd16de2ec9269b45852756259e351',
    'f6805c12c49055c3d60db266e40322c7aa2187a23450adc3631ad71120dd3f6c'),
  garment('white-puffer', '白色立领羽绒服', 'outerwear', '暖白色', '', '保暖、立领、绗缝',
    'winter', 3, 'accent', '8929e9f487e9cfe5a5953c3552c784c3',
    'e1f2deb54f4fe308c86ab3539fb690a742079a52cf9c277b5b990937902466fc'),
  garment('light-blue-jeans', '浅蓝色牛仔裤', 'bottom', '浅蓝色', '靛蓝', '休闲、高腰、水洗、直筒',
    'spring、autumn', 2, 'basic', 'a99416876ee749209a63ee61c4119910',
    'e5797713fda2ec93379ed0b94e1b2e1998586666aee0d8d192b073f0211fee37'),
  garment('white-platform-sneakers', '白色厚底运动鞋', 'shoes', '米白色', '米色', '运动、网面、厚底',
    'spring、summer、autumn', 2, 'accent', 'b5f922a651379879969c22772daf97a0',
    'aded91cb3ab90ba831d97e199f18808723f271f2e587caffa39cd801cdff6591'),
  garment('purple-graphic-tee', '紫色印花 T 恤', 'top', '灰紫色', '奶油色、浅金、深绿', '复古、印花、短袖、宽松',
    'spring、summer', 1, 'statement', 'c36ccdad34afa4c09314a2fe9e8ea18a',
    '967fcb8278f30efd352876113e36e5485196c0d68ba751d06c697e5df068730b'),
];

function garment(id, name, category, primaryColor, secondaryColors, styleTags, seasons,
  warmthLevel, statementLevel, sourceFile, sha256) {
  return {
    id, name, category, primaryColor, secondaryColors: split(secondaryColors), styleTags: split(styleTags),
    seasons: split(seasons), warmthLevel, statementLevel, availability: 'available',
    originalImage: './local-wardrobe/original/' + sourceFile + '.png',
    cartoonDisplayImage: './assets/wardrobe/display/' + id + '.webp',
    sha256, tryOnStatus: 'pending', tryOnAssets: {},
  };
}

function split(value) {
  return value ? value.split('、') : [];
}
