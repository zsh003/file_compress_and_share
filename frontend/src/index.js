import React, { useState, useEffect } from 'react';
import { Layout, Upload, Button, Radio, message, Card, Typography, Progress, Space, Divider, Steps } from 'antd';
import { UploadOutlined, DownloadOutlined, InboxOutlined, FileOutlined, CompressOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';
import { createRoot } from 'react-dom/client';

const { Header, Content } = Layout;
const { Title } = Typography;
const { Step } = Steps;

// 配置axios拦截器
axios.interceptors.request.use(
  request => {
    console.log('请求数据:', request);
    return request;
  },
  error => {
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  response => {
    console.log('响应数据:', response);
    return response;
  },
  error => {
    console.error('响应错误:', error);
    return Promise.reject(error);
  }
);

function Index() {
  const [algorithm, setAlgorithm] = useState('lz77');
  const [compressedFile, setCompressedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [compressionDetails, setCompressionDetails] = useState({
    originalSize: 0,
    compressedSize: 0,
    compressionRatio: 0,
    timeElapsed: 0
  });
  const [compressionTaskId, setCompressionTaskId] = useState(null);

  // 使用WebSocket监听压缩进度
  useEffect(() => {
    let ws = null;
    let pingInterval = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    const reconnectDelay = 1000; // 1秒

    const connectWebSocket = () => {
      if (ws) {
        ws.close();
      }

      ws = new WebSocket('ws://localhost:8000/ws/compression');

      ws.onopen = () => {
        console.log('WebSocket连接已建立');
        reconnectAttempts = 0;
        // 开启心跳检测
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
              ws.send("ping");
          }
        }, 25000); // 25秒发送一次心跳
      };

      ws.onmessage = (event) => {
        try {
          // 处理心跳响应
          if (event.data === 'pong') {
            console.log('收到心跳响应');
            return;
          } else {
            const data = JSON.parse(event.data);
            console.log('收到WebSocket消息:', data);
            if (data.type === 'progress') {
              setCompressionProgress(data.progress);
              setCompressionDetails({
                originalSize: data.originalSize,
                compressedSize: data.compressedSize,
                compressionRatio: data.compressionRatio,
                timeElapsed: data.timeElapsed
              });
            } else if (data.type === 'complete') {
              setCurrentStep(2);
              setIsCompressing(false);
              setCompressionTaskId(null);
              message.success('文件压缩完成！');
            } else if (data.type === 'error') {
              setIsCompressing(false);
              setCurrentStep(0);
              setCompressionTaskId(null);
              message.error('压缩过程出错：' + data.message);
            } else if (data.type === 'stopped') {
              setIsCompressing(false);
              setCurrentStep(0);
              setCompressionTaskId(null);
              message.info('压缩已停止');
            }
          }
        } catch (error) {
          console.error('处理WebSocket消息时出错:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket连接已关闭');
        clearInterval(pingInterval);
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`尝试重新连接 (${reconnectAttempts}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, reconnectDelay);
        } else {
          console.error('WebSocket重连失败，已达到最大重试次数');
          message.error('无法连接到服务器，请检查服务器是否正在运行');
        }
      };
    };

    connectWebSocket();

    return () => {
      clearInterval(pingInterval);
      if (ws) ws.close();
    };
  }, []);

  const handleStopCompression = async () => {
    if (!compressionTaskId) {
      message.warning('没有正在进行的压缩任务');
      return;
    }

    try {
      await axios.post(`http://localhost:8000/stop_compression/${compressionTaskId}`);
      message.info('正在停止压缩...');
    } catch (error) {
      console.error('停止压缩失败:', error);
      message.error('停止压缩失败：' + error.message);
    }
  };

  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('algorithm', algorithm);

    try {
      setIsCompressing(true);
      setUploadProgress(0);
      setCompressionProgress(0);
      setCurrentStep(0);
      setCompressionDetails({
        originalSize: file.size,
        compressedSize: 0,
        compressionRatio: 0,
        timeElapsed: 0
      });

      // 配置axios以支持上传进度
      const config = {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
          if (progress === 100) {
            setCurrentStep(1);
          }
        }
      };

      const response = await axios.post('http://localhost:8000/upload', formData, config);
      console.log('请求完成响应:', response.data);
      setCompressionTaskId(response.data.taskId);
    } catch (error) {
      console.error('请求失败:', error);
      message.error('请求失败：' + error.message);
      setIsCompressing(false);
      setCurrentStep(0);
      //setCompressionTaskId(null);
    }
  };

  const handleDownload = async () => {
    if (!compressedFile) {
      message.warning('请先压缩文件！');
      return;
    }

    try {
      console.log('开始下载文件:', compressedFile);
      const response = await axios.get(`http://localhost:8000/download/${compressedFile}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', compressedFile);
      document.body.appendChild(link);
      link.click();
      link.remove();
      console.log('文件下载完成');
    } catch (error) {
      console.error('下载失败:', error);
      message.error('文件下载失败：' + error.message);
    }
  };

  const handleDecompress = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('algorithm', algorithm);

    try {
      console.log('开始解压文件:', file.name);
      const response = await axios.post('http://localhost:8000/decompress', formData);
      console.log('解压完成响应:', response.data);
      
      const decompressedFile = response.data.filename;
      
      // 下载解压后的文件
      const downloadResponse = await axios.get(`http://localhost:8000/download/${decompressedFile}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([downloadResponse.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', decompressedFile);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      message.success('文件解压成功！');
    } catch (error) {
      console.error('解压失败:', error);
      message.error('文件解压失败：' + error.message);
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 50px' }}>
        <Title level={3} style={{ margin: '16px 0' }}>文件压缩分享系统</Title>
      </Header>
      <Content style={{ padding: '50px' }}>
        <Card style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <Title level={4}>选择压缩算法：</Title>
            <Radio.Group value={algorithm} onChange={e => setAlgorithm(e.target.value)}>
              <Radio.Button value="lz77">LZ77算法</Radio.Button>
              <Radio.Button value="huffman">哈夫曼编码</Radio.Button>
              <Radio.Button value="zip">ZIP压缩</Radio.Button>
            </Radio.Group>
          </div>

          <Divider>压缩文件</Divider>
          
          <Steps current={currentStep} style={{ marginBottom: 24 }}>
            <Step title="上传文件" icon={<FileOutlined />} />
            <Step title="压缩中" icon={<CompressOutlined />} />
            <Step title="完成" icon={<CheckCircleOutlined />} />
          </Steps>
          
          <div style={{ marginBottom: 24 }}>
            <Title level={4}>上传文件：</Title>
            <Space>
              <Upload
                beforeUpload={handleUpload}
                showUploadList={false}
                maxCount={1}
              >
                <Button icon={<UploadOutlined />}>选择文件</Button>
              </Upload>
              {isCompressing && (
                <Button 
                  danger 
                  onClick={handleStopCompression}
                  icon={<StopOutlined />}
                >
                  停止压缩
                </Button>
              )}
            </Space>
            
            {isCompressing && (
              <div style={{ marginTop: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>
                    <div>上传进度：</div>
                    <Progress percent={uploadProgress} status="active" />
                  </div>
                  <div>
                    <div>压缩进度：</div>
                    <Progress 
                      percent={compressionProgress} 
                      status="active" 
                      format={percent => `${percent}%`}
                    />
                  </div>
                  
                  {compressionDetails.originalSize > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div>原始大小: {formatFileSize(compressionDetails.originalSize)}</div>
                      <div>压缩后大小: {formatFileSize(compressionDetails.compressedSize)}</div>
                      <div>压缩率: {compressionDetails.compressionRatio.toFixed(2)}%</div>
                      <div>耗时: {compressionDetails.timeElapsed.toFixed(2)}秒</div>
                    </div>
                  )}
                </Space>
              </div>
            )}
          </div>

          {compressedFile && (
            <div>
              <Title level={4}>下载压缩文件：</Title>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
              >
                下载压缩文件
              </Button>
            </div>
          )}

          <Divider>解压文件</Divider>
          <div>
            <Title level={4}>上传压缩文件进行解压：</Title>
            <Upload
              beforeUpload={handleDecompress}
              showUploadList={false}
              maxCount={1}
            >
              <Button icon={<InboxOutlined />}>选择压缩文件</Button>
            </Upload>
          </div>
        </Card>
      </Content>
    </Layout>
  );
}

export default Index;

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <Index />
  </React.StrictMode>
);