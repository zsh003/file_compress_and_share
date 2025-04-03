import React, { useState, useEffect } from 'react';
import { Layout, Upload, Button, Radio, message, Card, Typography, Progress, Space, Divider, Steps, Modal, Input, Tooltip } from 'antd';
import { UploadOutlined, DownloadOutlined, InboxOutlined, FileOutlined, CompressOutlined, CheckCircleOutlined, StopOutlined, ShareAltOutlined, CopyOutlined } from '@ant-design/icons';
import axios from 'axios';
import { createRoot } from 'react-dom/client';
import { Line, Pie, Column } from '@ant-design/charts';

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
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const [compressionDetails, setCompressionDetails] = useState({
    originalSize: 0,
    compressedSize: 0,
    compressionRatio: 0,
    timeElapsed: 0
  });
  const [compressionTaskId, setCompressionTaskId] = useState(null);
  const [ws, setWs] = useState(null);
  const [isWsConnecting, setIsWsConnecting] = useState(false);

  // 图表相关状态
  const [progressData, setProgressData] = useState([]);
  const [compressionSpeedData, setCompressionSpeedData] = useState([]);
  const [compressionStartTime, setCompressionStartTime] = useState(null);
  const [lastProgressUpdate, setLastProgressUpdate] = useState(null);
  const [maxDataPoints, setMaxDataPoints] = useState(50); // 最大数据点数量

  // 分享相关状态
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [currentShareFile, setCurrentShareFile] = useState(null);
  const [shareInfo, setShareInfo] = useState(null);
  const [shareLink, setShareLink] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  // 建立WebSocket连接
  const connectWebSocket = () => {
    return new Promise((resolve, reject) => {
      if (ws) {
        ws.close();
      }

      setIsWsConnecting(true);
      const newWs = new WebSocket('ws://localhost:8000/ws/compression');
      let connectionTimeout = null;

      // 设置连接超时
      connectionTimeout = setTimeout(() => {
        if (newWs.readyState !== WebSocket.OPEN) {
          newWs.close();
          setIsWsConnecting(false);
          reject(new Error('WebSocket连接超时'));
        }
      }, 5000); // 5秒超时

      newWs.onopen = () => {
        console.log('WebSocket连接已建立');
        clearTimeout(connectionTimeout);
        setIsWsConnecting(false);
        resolve(newWs);
      };

      newWs.onmessage = (event) => {
        try {
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

            // 记录压缩开始时间
            if (!compressionStartTime) {
              setCompressionStartTime(Date.now());
              setLastProgressUpdate(Date.now());
            }

            // 更新进度时间线数据
            const currentTime = Date.now();
            const timeElapsed = (currentTime - compressionStartTime) / 1000; // 转换为秒

            // 更新进度时间线数据
            setProgressData(prevData => {
              const newData = [...prevData, {
                time: timeElapsed.toFixed(2),
                progress: data.progress
              }];
              // 限制数据点数量
              if (newData.length > maxDataPoints) {
                // 保留最新的数据点，删除最旧的数据点
                return newData.slice(newData.length - maxDataPoints);
              }
              return newData;
            });

            // 计算压缩速度 (字节/秒)
            if (lastProgressUpdate) {
              const timeDiff = (currentTime - lastProgressUpdate) / 1000; // 转换为秒
              if (timeDiff > 0) {
                const progressDiff = data.progress - (progressData.length > 0 ? progressData[progressData.length - 1].progress : 0);
                const speed = (data.originalSize * (progressDiff / 100)) / timeDiff; // 字节/秒

                setCompressionSpeedData(prevData => {
                  const newData = [...prevData, {
                    time: timeElapsed.toFixed(2),
                    speed: speed
                  }];
                  // 限制数据点数量
                  if (newData.length > maxDataPoints) {
                    // 保留最新的数据点，删除最旧的数据点
                    return newData.slice(newData.length - maxDataPoints);
                  }
                  return newData;
                });
              }
            }

            setLastProgressUpdate(currentTime);
          } else if (data.type === 'complete') {
            setCurrentStep(2);
            setIsCompressing(false);
            setIsStopping(false);
            setCompressionTaskId(null);

            // 更新文件列表，添加压缩完成的信息
            setFiles(prevFiles => {
              const updatedFiles = [...prevFiles];
              const lastFile = updatedFiles[updatedFiles.length - 1];
              if (lastFile) {
                lastFile.compressed = true;
                lastFile.compressedName = data.filename;
                lastFile.compressionDetails = {
                  originalSize: data.originalSize,
                  compressedSize: data.compressedSize,
                  compressionRatio: data.compressionRatio,
                  timeElapsed: data.timeElapsed
                };
                // 保留算法信息
                lastFile.algorithm = lastFile.algorithm || algorithm;
              }
              return updatedFiles;
            });

            message.success('文件压缩完成！');
            closeWebSocket();
          } else if (data.type === 'error') {
            setIsCompressing(false);
            setIsStopping(false);
            setCurrentStep(0);
            setCompressionTaskId(null);
            setCompressionProgress(0);
            setCompressionDetails({
              originalSize: 0,
              compressedSize: 0,
              compressionRatio: 0,
              timeElapsed: 0
            });
            // 重置图表数据
            setProgressData([]);
            setCompressionSpeedData([]);
            setCompressionStartTime(null);
            setLastProgressUpdate(null);
            message.error('压缩过程出错：' + data.message);
            closeWebSocket();
          } else if (data.type === 'stopped') {
            setIsCompressing(false);
            setIsStopping(false);
            setCurrentStep(0);
            setCompressionTaskId(null);
            setCompressionProgress(0);
            setCompressionDetails({
              originalSize: 0,
              compressedSize: 0,
              compressionRatio: 0,
              timeElapsed: 0
            });
            // 重置图表数据
            setProgressData([]);
            setCompressionSpeedData([]);
            setCompressionStartTime(null);
            setLastProgressUpdate(null);
            message.info('压缩已停止');
            closeWebSocket();
          }
        } catch (error) {
          console.error('处理WebSocket消息时出错:', error);
        }
      };

      newWs.onerror = (error) => {
        console.error('WebSocket错误:', error);
        clearTimeout(connectionTimeout);
        setIsWsConnecting(false);
        reject(error);
      };

      newWs.onclose = () => {
        console.log('WebSocket连接已关闭');
        clearTimeout(connectionTimeout);
        setIsWsConnecting(false);
        if (isCompressing && !isStopping) {
          message.error('WebSocket连接已断开，压缩可能无法正常进行');
        }
      };

      setWs(newWs);
    });
  };

  // 关闭WebSocket连接
  const closeWebSocket = () => {
    if (ws) {
      ws.close();
      setWs(null);
    }
  };

  const handleStopCompression = async () => {
    if (!compressionTaskId) {
      message.warning('没有正在进行的压缩任务');
      return;
    }

    try {
      setIsStopping(true);
      message.loading('正在停止压缩...');
      await axios.post(`http://localhost:8000/stop_compression/${compressionTaskId}`);
      // 不在这里关闭WebSocket，等待后端发送stopped消息
    } catch (error) {
      message.destroy();
      console.error('停止压缩失败:', error);
      message.error('停止压缩失败：' + error.message);
      setIsStopping(false);
      closeWebSocket();
    }
  };

  const handleUpload = async (file) => {
    try {
      // 在文件上传前建立WebSocket连接
      await connectWebSocket();

      // 添加文件到文件列表
      setFiles(prevFiles => [...prevFiles, {
        name: file.name,
        size: file.size,
        algorithm: algorithm,
        compressed: false
      }]);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('algorithm', algorithm);

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

      // 重置图表数据
      setProgressData([]);
      setCompressionSpeedData([]);
      setCompressionStartTime(null);
      setLastProgressUpdate(null);

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
      setCompressionTaskId(null);
      setCompressionProgress(0);
      setCompressionDetails({
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        timeElapsed: 0
      });
      closeWebSocket();
    }
  };

  const handleDownload = async (filename) => {
    try {
      console.log('开始下载文件:', filename);
      const response = await axios.get(`http://localhost:8000/download/${filename}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
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

  // 处理分享文件
  const handleShare = async (file) => {
    try {
      setIsSharing(true);
      setCurrentShareFile(file);
      setShareModalVisible(true);

      // 调用后端API生成分享链接和密码
      const response = await axios.post(`http://localhost:8000/share/${file.compressedName}`);

      // 获取本机IP地址
      const ipResponse = await axios.get('http://localhost:8000/ip');
      const serverIp = ipResponse.data.ip;

      // 构建完整的分享链接
      const fullShareLink = `http://${serverIp}:8000/shared/${response.data.share_id}/${file.compressedName}?password=${response.data.password}`;

      setShareInfo(response.data);
      setShareLink(fullShareLink);
      setSharePassword(response.data.password);

      // 更新文件列表中的分享信息
      setFiles(prevFiles => {
        return prevFiles.map(f => {
          if (f.name === file.name) {
            return {
              ...f,
              shareInfo: {
                shareId: response.data.share_id,
                password: response.data.password,
                link: fullShareLink
              }
            };
          }
          return f;
        });
      });
    } catch (error) {
      console.error('分享失败:', error);
      message.error('分享失败：' + error.message);
    } finally {
      setIsSharing(false);
    }
  };

  // 复制分享链接到剪贴板
  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink)
      .then(() => {
        message.success('分享链接已复制到剪贴板');
      })
      .catch(err => {
        console.error('复制失败:', err);
        message.error('复制失败，请手动复制');
      });
  };

  // 复制密码到剪贴板
  const copyPassword = () => {
    navigator.clipboard.writeText(sharePassword)
      .then(() => {
        message.success('密码已复制到剪贴板');
      })
      .catch(err => {
        console.error('复制失败:', err);
        message.error('复制失败，请手动复制');
      });
  };

  // 组件卸载时关闭WebSocket连接
  useEffect(() => {
    return () => {
      closeWebSocket();
    };
  }, []);

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
                  loading={isStopping}
                  disabled={isStopping}
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

                  {/* 压缩过程中的实时图表 */}
                  {compressionProgress > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Title level={5}>实时压缩分析</Title>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {/* 压缩进度时间线 */}
                        {progressData.length > 0 && (
                          <Card title="压缩进度时间线" size="small">
                            <Line
                              data={progressData}
                              xField="time"
                              yField="progress"
                              xAxis={{
                                title: { text: '时间 (秒)' },
                                // 限制横坐标范围，只显示最近的数据
                                min: progressData.length > 0 ? Math.max(0, parseFloat(progressData[progressData.length - 1].time) - 30) : 0,
                                max: progressData.length > 0 ? parseFloat(progressData[progressData.length - 1].time) : 0,
                              }}
                              yAxis={{
                                title: { text: '进度 (%)' },
                                min: 0,
                                max: 100,
                              }}
                              point={{
                                size: 2,
                                shape: 'circle',
                              }}
                              tooltip={{
                                formatter: (datum) => {
                                  return { name: '进度', value: datum.progress + '%' };
                                },
                              }}
                              height={200}
                            />
                          </Card>
                        )}

                        {/* 压缩速度折线图 */}
                        {compressionSpeedData.length > 0 && (
                          <Card title="压缩速度变化" size="small">
                            <Line
                              data={compressionSpeedData}
                              xField="time"
                              yField="speed"
                              xAxis={{
                                title: { text: '时间 (秒)' },
                                // 限制横坐标范围，只显示最近的数据
                                min: compressionSpeedData.length > 0 ? Math.max(0, parseFloat(compressionSpeedData[compressionSpeedData.length - 1].time) - 30) : 0,
                                max: compressionSpeedData.length > 0 ? parseFloat(compressionSpeedData[compressionSpeedData.length - 1].time) : 0,
                              }}
                              yAxis={{
                                title: { text: '速度 (字节/秒)' },
                              }}
                              point={{
                                size: 2,
                                shape: 'circle',
                              }}
                              tooltip={{
                                formatter: (datum) => {
                                  return { name: '速度', value: formatFileSize(datum.speed) + '/秒' };
                                },
                              }}
                              height={200}
                            />
                          </Card>
                        )}
                      </Space>
                    </div>
                  )}
                </Space>
              </div>
            )}
          </div>

          {/* 文件列表 */}
          {files.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Title level={4}>文件列表：</Title>
              <Space direction="vertical" style={{ width: '100%' }}>
                {files.map((file, index) => (
                  <Card key={index} size="small" style={{ marginBottom: 8 }}>
                    <div>
                      <div><strong>文件名：</strong>{file.name}</div>
                      <div><strong>原始大小：</strong>{formatFileSize(file.size)}</div>
                      <div><strong>压缩算法：</strong>{file.algorithm || '未压缩'}</div>

                      {file.compressed && file.compressionDetails && (
                        <>
                          <div><strong>压缩后大小：</strong>{formatFileSize(file.compressionDetails.compressedSize)}</div>
                          <div><strong>压缩率：</strong>{file.compressionDetails.compressionRatio ? file.compressionDetails.compressionRatio.toFixed(2) : '0.00'}%</div>
                          <div><strong>耗时：</strong>{file.compressionDetails.timeElapsed ? file.compressionDetails.timeElapsed.toFixed(2) : '0.00'}秒</div>

                          {/* 压缩效果图表 */}
                          <div style={{ marginTop: 16 }}>
                            <Title level={5}>压缩效果分析</Title>
                            <Space direction="vertical" style={{ width: '100%' }}>
                              {/* 压缩前后大小对比饼图 */}
                              <Card title="压缩前后大小对比" size="small">
                                <Pie
                                  data={[
                                    { type: '原始大小', value: file.compressionDetails.originalSize },
                                    { type: '压缩后大小', value: file.compressionDetails.compressedSize }
                                  ]}
                                  angleField="value"
                                  colorField="type"
                                  radius={0.8}
                                  label={{
                                    type: 'outer',
                                    content: '{name} {percentage}',
                                  }}
                                  interactions={[
                                    {
                                      type: 'element-active',
                                    },
                                  ]}
                                  height={200}
                                />
                              </Card>

                              {/* 压缩进度时间线 */}
                              {progressData.length > 0 && (
                                <Card title="压缩进度时间线" size="small">
                                  <Line
                                    data={progressData}
                                    xField="time"
                                    yField="progress"
                                    xAxis={{
                                      title: { text: '时间 (秒)' },
                                      // 限制横坐标范围，只显示最近的数据
                                      min: progressData.length > 0 ? Math.max(0, parseFloat(progressData[progressData.length - 1].time) - 30) : 0,
                                      max: progressData.length > 0 ? parseFloat(progressData[progressData.length - 1].time) : 0,
                                    }}
                                    yAxis={{
                                      title: { text: '进度 (%)' },
                                      min: 0,
                                      max: 100,
                                    }}
                                    point={{
                                      size: 2,
                                      shape: 'circle',
                                    }}
                                    tooltip={{
                                      formatter: (datum) => {
                                        return { name: '进度', value: datum.progress + '%' };
                                      },
                                    }}
                                    height={200}
                                  />
                                </Card>
                              )}

                              {/* 压缩速度折线图 */}
                              {compressionSpeedData.length > 0 && (
                                <Card title="压缩速度变化" size="small">
                                  <Line
                                    data={compressionSpeedData}
                                    xField="time"
                                    yField="speed"
                                    xAxis={{
                                      title: { text: '时间 (秒)' },
                                      // 限制横坐标范围，只显示最近的数据
                                      min: compressionSpeedData.length > 0 ? Math.max(0, parseFloat(compressionSpeedData[compressionSpeedData.length - 1].time) - 30) : 0,
                                      max: compressionSpeedData.length > 0 ? parseFloat(compressionSpeedData[compressionSpeedData.length - 1].time) : 0,
                                    }}
                                    yAxis={{
                                      title: { text: '速度 (字节/秒)' },
                                    }}
                                    point={{
                                      size: 2,
                                      shape: 'circle',
                                    }}
                                    tooltip={{
                                      formatter: (datum) => {
                                        return { name: '速度', value: formatFileSize(datum.speed) + '/秒' };
                                      },
                                    }}
                                    height={200}
                                  />
                                </Card>
                              )}
                            </Space>
                          </div>

                          <div style={{ marginTop: 8 }}>
                            <Space>
                              <Button
                                type="primary"
                                icon={<DownloadOutlined />}
                                onClick={() => handleDownload(file.compressedName)}
                              >
                                下载压缩文件
                              </Button>
                              <Button
                                icon={<ShareAltOutlined />}
                                onClick={() => handleShare(file)}
                              >
                                分享文件
                              </Button>
                            </Space>
                          </div>

                          {file.shareInfo && (
                            <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                              <div><strong>分享链接：</strong>
                                <Tooltip title="点击复制">
                                  <a onClick={copyShareLink}>{file.shareInfo.link}</a>
                                </Tooltip>
                              </div>
                              <div><strong>分享密码：</strong>
                                <Tooltip title="点击复制">
                                  <a onClick={copyPassword}>{file.shareInfo.password}</a>
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

      {/* 分享对话框 */}
      <Modal
        title="分享文件"
        open={shareModalVisible}
        onCancel={() => setShareModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setShareModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {isSharing ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Progress type="circle" percent={100} status="active" />
            <div style={{ marginTop: 16 }}>正在生成分享链接...</div>
          </div>
        ) : shareInfo ? (
          <div>
            <p>文件已成功分享！请将以下链接和密码发送给需要下载的人：</p>
            <div style={{ marginBottom: 16 }}>
              <div><strong>分享链接：</strong></div>
              <Input.Group compact>
                <Input
                  style={{ width: 'calc(100% - 32px)' }}
                  value={shareLink}
                  readOnly
                />
                <Tooltip title="复制链接">
                  <Button icon={<CopyOutlined />} onClick={copyShareLink} />
                </Tooltip>
              </Input.Group>
            </div>
            <div>
              <div><strong>分享密码：</strong></div>
              <Input.Group compact>
                <Input
                  style={{ width: 'calc(100% - 32px)' }}
                  value={sharePassword}
                  readOnly
                />
                <Tooltip title="复制密码">
                  <Button icon={<CopyOutlined />} onClick={copyPassword} />
                </Tooltip>
              </Input.Group>
            </div>
            <div style={{ marginTop: 16, color: '#ff4d4f' }}>
              <p>注意：密码仅显示一次，请妥善保存！</p>
            </div>
          </div>
        ) : (
          <div>加载中...</div>
        )}
      </Modal>
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