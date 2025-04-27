import React, { useState } from 'react';
import { Upload, Button, Radio, Space, Typography, Checkbox, Input, Tooltip } from 'antd';
import { UploadOutlined, LockOutlined } from '@ant-design/icons';
import { ALGORITHMS, getAlgorithmDisplayName, getAlgorithmDescription } from '../constants/algorithms';

const { Title } = Typography;

export const FileUploader = ({ 
  algorithm, 
  onAlgorithmChange, 
  onFileUpload,
  isCompressing,
  isStopping,
  onStopCompression,
  enableEncryption = false,
  encryptionKey = '',
  onEnableEncryptionChange,
  onEncryptionKeyChange
}) => {
  const [showEncryptionKey, setShowEncryptionKey] = useState(false);

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ marginBottom: 16 }}>选择压缩算法：</Title>
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

      <div style={{ marginBottom: 16 }}>
        <Title level={4}>加密设置：</Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Checkbox 
            checked={enableEncryption} 
            onChange={e => onEnableEncryptionChange(e.target.checked)}
          >
            启用AES加密
          </Checkbox>
          
          {enableEncryption && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
              <Input
                prefix={<LockOutlined />}
                placeholder="输入加密密钥，为空则自动生成"
                value={encryptionKey}
                onChange={e => onEncryptionKeyChange(e.target.value)}
                type={showEncryptionKey ? "text" : "password"}
                style={{ width: '300px', marginRight: '8px' }}
              />
              <Button 
                size="small" 
                onClick={() => setShowEncryptionKey(!showEncryptionKey)}
              >
                {showEncryptionKey ? '隐藏' : '显示'}
              </Button>
              <Tooltip title="如果不输入密钥，系统将自动生成一个随机密钥。请务必保存好密钥，解压时将需要此密钥。">
                <Button size="small" type="link">?</Button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      <div>
        <Title level={4}>上传文件：</Title>
        <Space>
          <Upload
            beforeUpload={onFileUpload}
            showUploadList={false}
            maxCount={1}
          >
            <Button 
              icon={<UploadOutlined />} 
              size="large"
              disabled={isCompressing}
            >
              选择文件
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