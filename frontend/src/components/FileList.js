import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Table, Button, Space, Tag, Tooltip, message } from 'antd';
import { DownloadOutlined, ShareAltOutlined, FileZipOutlined, CopyOutlined, LockOutlined, UnlockOutlined, ReloadOutlined } from '@ant-design/icons';
import { getAlgorithmDisplayName, getAlgorithmColor } from '../constants/algorithms';
import axiosInstance from '../utils/axios';

export const FileList = forwardRef(({ 
  onDownload, 
  onShare, 
  onDecompress,
  onCopyShareLink,
  onCopyPassword
}, ref) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // 获取文件列表
  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/files');
      // 确保文件数据格式正确
      const formattedFiles = response.data.map(file => ({
        id: file.id,
        originalName: file.filename,
        compressedName: `${file.filename}.compressed`,
        algorithm: file.algorithm,
        size: file.original_size,
        compressedSize: file.compressed_size,
        compressionRatio: file.compression_ratio,
        shareInfo: file.shareInfo,
        createdAt: file.created_at,
        is_encrypted: file.is_encrypted,
        encryption_key: file.encryption_key
      }));
      setFiles(formattedFiles);
    } catch (error) {
      console.error('获取文件列表失败:', error);
      message.error('获取文件列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    fetchFiles
  }));

  // 组件加载时获取文件列表
  useEffect(() => {
    fetchFiles();
  }, []);

  const columns = [
    {
      title: '文件名',
      dataIndex: 'originalName',
      key: 'originalName',
      render: (text, record) => (
        <div>
          <div>
            {text}
            {record.is_encrypted ? (
              <Tooltip title="文件已加密">
                <LockOutlined style={{ color: '#ff4d4f', marginLeft: 8 }} />
              </Tooltip>
            ) : (
              <Tooltip title="文件未加密">
                <UnlockOutlined style={{ color: '#52c41a', marginLeft: 8 }} />
              </Tooltip>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            压缩后: {record.compressedName}
          </div>
        </div>
      )
    },
    {
      title: '压缩算法',
      dataIndex: 'algorithm',
      key: 'algorithm',
      render: (algorithm) => (
        <Tag color={getAlgorithmColor(algorithm)}>
          {getAlgorithmDisplayName(algorithm)}
        </Tag>
      )
    },
    {
      title: '文件大小',
      dataIndex: 'size',
      key: 'size',
      render: (size) => {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
        return `${(size / (1024 * 1024)).toFixed(2)} MB`;
      }
    },
    {
      title: '压缩比',
      dataIndex: 'compressionRatio',
      key: 'compressionRatio',
      render: (ratio) => `${(ratio * 100).toFixed(2)}%`
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => onDownload(record.compressedName)}
          >
            下载
          </Button>
          <Button
            icon={<ShareAltOutlined />}
            onClick={() => onShare(record)}
          >
            分享
          </Button>
          <Button
            icon={<FileZipOutlined />}
            onClick={() => onDecompress(record)}
          >
            解压
          </Button>
          {record.shareInfo && (
            <>
              <Tooltip title="复制分享链接">
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => onCopyShareLink(record.shareInfo.shareLink)}
                />
              </Tooltip>
              {record.shareInfo.password && (
                <Tooltip title="复制分享密码">
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => onCopyPassword(record.shareInfo.password)}
                  />
                </Tooltip>
              )}
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>我的文件</h2>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchFiles} 
          loading={loading}
        >
          刷新列表
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={files}
        rowKey="id"
        pagination={false}
        loading={loading}
      />
    </div>
  );
}); 