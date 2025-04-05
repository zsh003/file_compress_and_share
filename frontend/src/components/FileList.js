import React from 'react';
import { Card, Button, Space, Tooltip } from 'antd';
import { DownloadOutlined, ShareAltOutlined, InboxOutlined } from '@ant-design/icons';
import { formatFileSize } from '../utils/fileUtils';
import { getAlgorithmDisplayName, getAlgorithmColor } from '../constants/algorithms';

export const FileList = ({
  files,
  onDownload,
  onShare,
  onDecompress,
  onCopyShareLink,
  onCopyPassword
}) => {
  if (!files.length) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {files.map((file, index) => (
        <Card key={index} size="small" style={{ marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div><strong>文件名：</strong>{file.name}</div>
              <div style={{ 
                padding: '4px 8px', 
                borderRadius: '4px', 
                backgroundColor: getAlgorithmColor(file.algorithm),
                fontWeight: 'bold'
              }}>
                {getAlgorithmDisplayName(file.algorithm)}
              </div>
            </div>
            <div><strong>原始大小：</strong>{formatFileSize(file.size)}</div>

            {file.compressed && file.compressionDetails && (
              <>
                <div><strong>原始大小：</strong>{formatFileSize(file.compressionDetails.originalSize)}</div>
                <div><strong>压缩后大小：</strong>{formatFileSize(file.compressionDetails.compressedSize)}</div>
                <div><strong>压缩率：</strong>{file.compressionDetails.compressionRatio ? file.compressionDetails.compressionRatio.toFixed(2) : '0.00'}%</div>
                <div><strong>耗时：</strong>{file.compressionDetails.timeElapsed ? file.compressionDetails.timeElapsed.toFixed(2) : '0.00'}秒</div>

                {/* 压缩结果数字展示 */}
                <Card size="small" style={{ marginTop: 8, marginBottom: 8 }}>
                  <Space size="large" style={{ width: '100%', justifyContent: 'space-around' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>原始大小</div>
                      <div style={{ fontSize: '20px', color: '#1890ff' }}>
                        {formatFileSize(file.compressionDetails.originalSize)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>压缩后大小</div>
                      <div style={{ fontSize: '20px', color: '#52c41a' }}>
                        {formatFileSize(file.compressionDetails.compressedSize)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>压缩率</div>
                      <div style={{ fontSize: '20px', color: '#faad14' }}>
                        {file.compressionDetails.compressionRatio ? file.compressionDetails.compressionRatio.toFixed(2) : '0.00'}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>总耗时</div>
                      <div style={{ fontSize: '20px', color: '#722ed1' }}>
                        {file.compressionDetails.timeElapsed ? file.compressionDetails.timeElapsed.toFixed(2) : '0.00'}秒
                      </div>
                    </div>
                  </Space>
                </Card>

                <div style={{ marginTop: 8 }}>
                  <Space>
                    <Button 
                      type="primary" 
                      icon={<DownloadOutlined />} 
                      onClick={() => onDownload(file.compressedName)}
                    >
                      下载压缩文件
                    </Button>
                    <Button
                      icon={<ShareAltOutlined />}
                      onClick={() => onShare(file)}
                    >
                      分享文件
                    </Button>
                    <Button
                      type="default"
                      icon={<InboxOutlined />}
                      onClick={() => onDecompress(file)}
                    >
                      解压文件
                    </Button>
                  </Space>
                </div>

                {file.shareInfo && (
                  <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                    <div><strong>分享链接：</strong>
                      <Tooltip title="点击复制">
                        <a onClick={() => onCopyShareLink(file.shareInfo.link)}>{file.shareInfo.link}</a>
                      </Tooltip>
                    </div>
                    <div><strong>分享密码：</strong>
                      <Tooltip title="点击复制">
                        <a onClick={() => onCopyPassword(file.shareInfo.password)}>{file.shareInfo.password}</a>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      ))}
    </Space>
  );
}; 