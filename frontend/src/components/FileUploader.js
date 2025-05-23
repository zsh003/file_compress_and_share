import React from 'react';
import { Upload, Button, Radio, Space, Typography } from 'antd';
import { UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { ALGORITHMS, getAlgorithmDisplayName, getAlgorithmDescription } from '../constants/algorithms';

const { Title } = Typography;

export const FileUploader = ({ 
  algorithm, 
  onAlgorithmChange, 
  onFileUpload,
  onFileDecompress,
  isCompressing,
  isStopping,
  onStopCompression
}) => {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ marginBottom: 16 }}>选择算法：</Title>
        <Radio.Group 
          value={algorithm} 
          onChange={e => onAlgorithmChange(e.target.value)} 
          size="large"
        >
          <Radio.Button value={ALGORITHMS.ZIP}>ZIP压缩</Radio.Button>
          <Radio.Button value={ALGORITHMS.HUFFMAN}>哈夫曼编码</Radio.Button>
          <Radio.Button value={ALGORITHMS.LZ77}>LZ77压缩</Radio.Button>
          <Radio.Button value={ALGORITHMS.COMBINED}>LZ77+哈夫曼</Radio.Button>
        </Radio.Group>
        <div style={{ marginTop: 8, color: '#666' }}>
          {getAlgorithmDescription(algorithm)}
        </div>
      </div>

      <div>
        <Title level={4}>文件操作：</Title>
        <Space size="large">
          <Upload
            beforeUpload={onFileUpload}
            showUploadList={false}
            maxCount={1}
          >
            <Button 
              icon={<UploadOutlined />} 
              size="large"
              disabled={isCompressing}
              type="primary"
            >
              上传文件压缩
            </Button>
          </Upload>

          <Upload
            beforeUpload={onFileDecompress}
            showUploadList={false}
            maxCount={1}
          >
            <Button 
              icon={<DownloadOutlined />} 
              size="large"
              disabled={isCompressing}
            >
              解压文件
            </Button>
          </Upload>

          {isCompressing && (
            <Button
              danger
              onClick={onStopCompression}
              loading={isStopping}
              disabled={isStopping}
              size="large"
            >
              停止压缩
            </Button>
          )}
        </Space>
      </div>
    </div>
  );
}; 