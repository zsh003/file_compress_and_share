// 压缩算法常量定义
export const ALGORITHMS = {
  ZIP: 'zip',
  HUFFMAN: 'huffman',
  LZ77: 'lz77',
  COMBINED: 'combined'
};

// 获取算法显示名称
export const getAlgorithmDisplayName = (algorithm) => {
  const displayNames = {
    [ALGORITHMS.ZIP]: 'ZIP',
    [ALGORITHMS.HUFFMAN]: 'Huffman',
    [ALGORITHMS.LZ77]: 'LZ77',
    [ALGORITHMS.COMBINED]: 'LZ77+Huffman'
  };
  return displayNames[algorithm] || algorithm;
};

// 获取算法描述
export const getAlgorithmDescription = (algorithm) => {
  switch (algorithm) {
    case ALGORITHMS.ZIP:
      return '使用ZIP算法进行压缩，适合通用文件压缩';
    case ALGORITHMS.HUFFMAN:
      return '使用哈夫曼编码进行压缩，适合文本文件';
    case ALGORITHMS.LZ77:
      return '使用LZ77算法进行压缩，适合重复数据较多的文件';
    case ALGORITHMS.COMBINED:
      return '使用LZ77和哈夫曼编码的组合进行压缩，适合文本文件和重复数据较多的文件';
    default:
      return '';
  }
};

// 获取算法标签颜色
export const getAlgorithmColor = (algorithm) => {
  const colors = {
    [ALGORITHMS.ZIP]: '#50b3df',
    [ALGORITHMS.HUFFMAN]: '#68e85a',
    [ALGORITHMS.LZ77]: '#ddce48',
    [ALGORITHMS.COMBINED]: '#fda370'
  };
  return colors[algorithm] || '#ffffff';
};

export const ALGORITHM_LABELS = {
  [ALGORITHMS.LZ77]: 'LZ77',
  [ALGORITHMS.HUFFMAN]: '哈夫曼编码',
  [ALGORITHMS.ZIP]: 'ZIP',
  [ALGORITHMS.COMBINED]: 'LZ77+哈夫曼'
}; 