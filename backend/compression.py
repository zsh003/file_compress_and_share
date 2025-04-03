import heapq
from collections import defaultdict
import struct
import time
import os
import zipfile

class LZ77Compressor:
    def __init__(self, window_size=4096, look_ahead_size=18):
        self.window_size = window_size
        self.look_ahead_size = look_ahead_size
        self.progress_callback = None
        self.start_time = 0
        self.original_size = 0
        
    def set_progress_callback(self, callback):
        self.progress_callback = callback

    async def compress(self, input_path, output_path):
        self.start_time = time.time()
        
        with open(input_path, 'rb') as file:
            data = file.read()
            self.original_size = len(data)
        
        compressed_data = []
        current_pos = 0
        total_positions = len(data)
        
        while current_pos < len(data):
            # 查找最长匹配
            match_length = 0
            match_offset = 0
            
            # 在滑动窗口中查找匹配
            for offset in range(1, min(self.window_size + 1, current_pos + 1)):
                if current_pos + offset > len(data):
                    break
                    
                length = 0
                while (current_pos + length < len(data) and 
                       current_pos - offset + length < current_pos and
                       data[current_pos + length] == data[current_pos - offset + length] and
                       length < self.look_ahead_size):
                    length += 1
                
                if length > match_length:
                    match_length = length
                    match_offset = offset
            
            # 写入压缩数据
            if match_length > 2:
                compressed_data.append((1, match_offset, match_length))
                current_pos += match_length
            else:
                compressed_data.append((0, data[current_pos], 0))
                current_pos += 1
                
            # 更新进度
            if self.progress_callback:
                progress = int((current_pos / total_positions) * 100)
                current_size = len(compressed_data) * 5  # 估算压缩后大小
                compression_ratio = (1 - current_size / self.original_size) * 100
                time_elapsed = time.time() - self.start_time
                
                await self.progress_callback({
                    'type': 'progress',
                    'progress': progress,
                    'originalSize': self.original_size,
                    'compressedSize': current_size,
                    'compressionRatio': compression_ratio,
                    'timeElapsed': time_elapsed
                })
        
        # 将压缩数据写入文件
        with open(output_path, 'wb') as file:
            for flag, offset, length in compressed_data:
                if flag == 1:
                    file.write(struct.pack('>BHH', 1, offset, length))
                else:
                    file.write(struct.pack('>BB', 0, offset))
        
        # 发送完成通知
        if self.progress_callback:
            final_size = os.path.getsize(output_path)
            compression_ratio = (1 - final_size / self.original_size) * 100
            time_elapsed = time.time() - self.start_time
            
            self.progress_callback({
                'type': 'complete',
                'filename': os.path.basename(output_path),
                'originalSize': self.original_size,
                'compressedSize': final_size,
                'compressionRatio': compression_ratio,
                'timeElapsed': time_elapsed
            })

    def decompress(self, input_path, output_path):
        with open(input_path, 'rb') as file:
            data = file.read()
        
        decompressed_data = []
        current_pos = 0
        
        while current_pos < len(data):
            flag = data[current_pos]
            if flag == 1:
                offset, length = struct.unpack('>HH', data[current_pos + 1:current_pos + 5])
                for i in range(length):
                    decompressed_data.append(decompressed_data[-offset + i])
                current_pos += 5
            else:
                decompressed_data.append(data[current_pos + 1])
                current_pos += 2
        
        with open(output_path, 'wb') as file:
            file.write(bytes(decompressed_data))

class HuffmanCompressor:
    def __init__(self):
        self.frequency = defaultdict(int)
        self.huffman_codes = {}
        self.reverse_mapping = {}
        self.progress_callback = None
        self.start_time = 0
        self.original_size = 0
        
    def set_progress_callback(self, callback):
        self.progress_callback = callback

    def make_frequency_dict(self, text):
        for symbol in text:
            self.frequency[symbol] += 1

    def make_heap(self):
        heap = [[weight, [symbol, ""]] for symbol, weight in self.frequency.items()]
        heapq.heapify(heap)
        return heap

    def merge_nodes(self, heap):
        while len(heap) > 1:
            lo = heapq.heappop(heap)
            hi = heapq.heappop(heap)
            for pair in lo[1:]:
                pair[1] = '0' + pair[1]
            for pair in hi[1:]:
                pair[1] = '1' + pair[1]
            heapq.heappush(heap, [lo[0] + hi[0]] + lo[1:] + hi[1:])

    def make_codes(self, heap):
        root = heapq.heappop(heap)
        current_code = root[1:]
        self.huffman_codes = dict(current_code)
        self.reverse_mapping = {v: k for k, v in self.huffman_codes.items()}

    def compress(self, input_path, output_path):
        self.start_time = time.time()
        
        with open(input_path, 'rb') as file:
            text = file.read()
            self.original_size = len(text)
        
        self.make_frequency_dict(text)
        heap = self.make_heap()
        self.merge_nodes(heap)
        self.make_codes(heap)
        
        encoded_text = ""
        total_symbols = len(text)
        processed_symbols = 0
        
        for symbol in text:
            encoded_text += self.huffman_codes[symbol]
            processed_symbols += 1
            
            # 更新进度
            if self.progress_callback and processed_symbols % 1000 == 0:
                progress = int((processed_symbols / total_symbols) * 50)  # 编码阶段占50%
                current_size = len(encoded_text) // 8  # 估算压缩后大小
                compression_ratio = (1 - current_size / self.original_size) * 100
                time_elapsed = time.time() - self.start_time
                
                self.progress_callback({
                    'type': 'progress',
                    'progress': progress,
                    'originalSize': self.original_size,
                    'compressedSize': current_size,
                    'compressionRatio': compression_ratio,
                    'timeElapsed': time_elapsed
                })
        
        # 填充编码后的文本
        padding_length = 8 - (len(encoded_text) % 8)
        encoded_text += '0' * padding_length
        
        # 将编码后的文本转换为字节
        b = bytearray()
        total_bytes = len(encoded_text) // 8
        processed_bytes = 0
        
        for i in range(0, len(encoded_text), 8):
            byte = encoded_text[i:i+8]
            b.append(int(byte, 2))
            processed_bytes += 1
            
            # 更新进度
            if self.progress_callback and processed_bytes % 1000 == 0:
                progress = 50 + int((processed_bytes / total_bytes) * 50)  # 字节转换阶段占50%
                current_size = len(b)
                compression_ratio = (1 - current_size / self.original_size) * 100
                time_elapsed = time.time() - self.start_time
                
                self.progress_callback({
                    'type': 'progress',
                    'progress': progress,
                    'originalSize': self.original_size,
                    'compressedSize': current_size,
                    'compressionRatio': compression_ratio,
                    'timeElapsed': time_elapsed
                })
        
        # 保存压缩数据
        with open(output_path, 'wb') as file:
            # 保存频率表
            file.write(struct.pack('>I', len(self.frequency)))
            for symbol, freq in self.frequency.items():
                file.write(struct.pack('>BI', symbol, freq))
            # 保存填充长度
            file.write(struct.pack('>B', padding_length))
            # 保存压缩后的数据
            file.write(bytes(b))
        
        # 发送完成通知
        if self.progress_callback:
            final_size = os.path.getsize(output_path)
            compression_ratio = (1 - final_size / self.original_size) * 100
            time_elapsed = time.time() - self.start_time
            
            self.progress_callback({
                'type': 'complete',
                'filename': os.path.basename(output_path),
                'originalSize': self.original_size,
                'compressedSize': final_size,
                'compressionRatio': compression_ratio,
                'timeElapsed': time_elapsed
            })

    def decompress(self, input_path, output_path):
        with open(input_path, 'rb') as file:
            # 读取频率表
            freq_size = struct.unpack('>I', file.read(4))[0]
            for _ in range(freq_size):
                symbol, freq = struct.unpack('>BI', file.read(5))
                self.frequency[symbol] = freq
            
            # 重建哈夫曼树
            heap = self.make_heap()
            self.merge_nodes(heap)
            self.make_codes(heap)
            
            # 读取填充长度
            padding_length = struct.unpack('>B', file.read(1))[0]
            
            # 读取压缩数据
            compressed_data = file.read()
            
            # 将字节转换回二进制字符串
            encoded_text = ""
            for byte in compressed_data:
                encoded_text += format(byte, '08b')
            
            # 移除填充
            encoded_text = encoded_text[:-padding_length]
            
            # 解码
            current_code = ""
            decompressed_data = []
            for bit in encoded_text:
                current_code += bit
                if current_code in self.reverse_mapping:
                    decompressed_data.append(self.reverse_mapping[current_code])
                    current_code = ""
            
            # 保存解压后的数据
            with open(output_path, 'wb') as file:
                file.write(bytes(decompressed_data))

class ZipCompressor:
    def __init__(self):
        self.progress_callback = None
        self.start_time = 0
        self.original_size = 0
        
    def set_progress_callback(self, callback):
        self.progress_callback = callback
        
    async def compress(self, input_path, output_path):
        self.start_time = time.time()
        self.original_size = os.path.getsize(input_path)
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # 添加文件到zip
            zipf.write(input_path, os.path.basename(input_path))
            
            # 模拟进度更新
            for i in range(101):
                if self.progress_callback:
                    current_size = os.path.getsize(output_path)
                    compression_ratio = (1 - current_size / self.original_size) * 100
                    time_elapsed = time.time() - self.start_time
                    
                    await self.progress_callback({
                        'type': 'progress',
                        'progress': i,
                        'originalSize': self.original_size,
                        'compressedSize': current_size,
                        'compressionRatio': compression_ratio,
                        'timeElapsed': time_elapsed
                    })
                
                time.sleep(0.05)  # 模拟压缩过程
        
        if self.progress_callback:
            self.progress_callback({
                'type': 'complete',
                'filename': os.path.basename(output_path)
            })
    
    def decompress(self, input_path, output_path):
        with zipfile.ZipFile(input_path, 'r') as zipf:
            zipf.extractall(os.path.dirname(output_path)) 