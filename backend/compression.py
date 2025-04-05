import heapq
from collections import defaultdict
import struct
import time
import os
import zipfile
#import py7zr
import rarfile
import tempfile
import shutil
import asyncio
import subprocess
from typing import Callable


class BaseCompressor:
    def __init__(self):
        self._progress_callback = None
        self._start_time = None

    def set_progress_callback(self, callback: Callable):
        self._progress_callback = callback

    async def _report_progress(self, progress: float, current_size: int, original_size: int):
        if self._progress_callback:
            elapsed_time = time.time() - self._start_time
            speed = current_size / elapsed_time if elapsed_time > 0 else 0
            await self._progress_callback({
                'type': 'progress',
                'progress': round(progress * 100, 2),
                'details': {
                    'original_size': original_size,
                    'current_size': current_size,
                    'speed': round(speed, 2),
                    'time_elapsed': round(elapsed_time, 2)
                }
            })

    async def _report_completion(self, final_size: int, original_size: int):
        if self._progress_callback:
            elapsed_time = time.time() - self._start_time
            await self._progress_callback({
                'type': 'completed',
                'progress': 100,
                'details': {
                    'original_size': original_size,
                    'current_size': final_size,
                    'speed': 0,
                    'time_elapsed': round(elapsed_time, 2)
                }
            })

class LZ77Compressor(BaseCompressor):
    def __init__(self, window_size=4096, look_ahead_size=18):
        super().__init__()
        self.window_size = window_size
        self.look_ahead_size = look_ahead_size

    async def compress(self, input_path: str, output_path: str):
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)

        with open(input_path, 'rb') as file:
            data = file.read()

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

            # 每处理1%的数据就更新一次进度
            if current_pos % (total_positions // 100) == 0 or current_pos == total_positions:
                progress = current_pos / total_positions
                current_size = len(compressed_data) * 5  # 估算压缩后大小
                await self._report_progress(progress, current_size, original_size)

        # 将压缩数据写入文件
        with open(output_path, 'wb') as file:
            for flag, offset, length in compressed_data:
                if flag == 1:
                    file.write(struct.pack('>BHH', 1, offset, length))
                else:
                    file.write(struct.pack('>BB', 0, offset))

        # 报告完成
        final_size = os.path.getsize(output_path)
        await self._report_completion(final_size, original_size)

    async def decompress(self, input_path: str, output_path: str):
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


class HuffmanCompressor(BaseCompressor):
    def __init__(self):
        super().__init__()
        self.frequency = defaultdict(int)
        self.huffman_codes = {}
        self.reverse_mapping = {}

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

    async def compress(self, input_path: str, output_path: str):
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)

        with open(input_path, 'rb') as file:
            text = file.read()

        # 第一阶段：构建Huffman树（10%进度）
        self.make_frequency_dict(text)
        heap = self.make_heap()
        self.merge_nodes(heap)
        self.make_codes(heap)
        await self._report_progress(0.1, 0, original_size)

        # 第二阶段：编码数据（40%进度）
        encoded_text = ""
        total_symbols = len(text)
        processed_symbols = 0

        for symbol in text:
            encoded_text += self.huffman_codes[symbol]
            processed_symbols += 1

            # 每处理1%的数据就更新一次进度
            if processed_symbols % (total_symbols // 100) == 0:
                progress = 0.1 + (processed_symbols / total_symbols * 0.4)  # 10%-50%的进度
                current_size = len(encoded_text) // 8
                await self._report_progress(progress, current_size, original_size)

        # 填充编码后的文本
        padding_length = 8 - (len(encoded_text) % 8)
        encoded_text += '0' * padding_length

        # 第三阶段：转换为字节并写入文件（50%进度）
        b = bytearray()
        total_bytes = len(encoded_text) // 8
        processed_bytes = 0

        # 保存频率表和填充长度
        header = struct.pack('>I', len(self.frequency))
        for symbol, freq in self.frequency.items():
            header += struct.pack('>BI', symbol, freq)
        header += struct.pack('>B', padding_length)
        b.extend(header)

        for i in range(0, len(encoded_text), 8):
            byte = encoded_text[i:i + 8]
            b.append(int(byte, 2))
            processed_bytes += 1

            if processed_bytes % (total_bytes // 50) == 0:
                progress = 0.5 + (processed_bytes / total_bytes * 0.5)  # 50%-100%的进度
                current_size = len(b)
                await self._report_progress(progress, current_size, original_size)
                await asyncio.sleep(0.01)

        # 写入文件
        with open(output_path, 'wb') as file:
            file.write(bytes(b))

        # 报告完成
        final_size = os.path.getsize(output_path)
        await self._report_completion(final_size, original_size)

    async def decompress(self, input_path: str, output_path: str):
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





class ZipCompressor(BaseCompressor):
    async def compress(self, input_path: str, output_path: str):
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)
        
        try:
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                # 获取输入文件的基本名称
                base_name = os.path.basename(input_path)
                
                # 写入文件并报告进度
                bytes_written = 0
                chunk_size = 8192  # 8KB chunks
                
                with open(input_path, 'rb') as f:
                    data = f.read()
                    total_size = len(data)
                    
                    # 将数据写入zip文件
                    zf.writestr(base_name, data)
                    
                    # 模拟进度更新
                    for i in range(0, 101, 2):  # 每2%更新一次
                        bytes_written = int((i / 100) * total_size)
                        progress = i / 100
                        await self._report_progress(progress, bytes_written, original_size)
                
                # 报告完成
                await self._report_completion(total_size, original_size)
                
        except Exception as e:
            print(f"压缩过程中出错: {str(e)}")
            raise

    async def decompress(self, input_path: str, output_path: str):
        with zipfile.ZipFile(input_path, 'r') as zf:
            zf.extractall(path=os.path.dirname(output_path))


class SevenZipCompressor:
    def __init__(self):
        self.progress_callback = None
        self.start_time = 0
        self.original_size = 0

    def set_progress_callback(self, callback):
        self.progress_callback = callback

    async def compress(self, input_path, output_path):
        self.start_time = time.time()
        self.original_size = os.path.getsize(input_path)
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        try:
            # 使用py7zr创建7z文件
            with py7zr.SevenZipFile(output_path, 'w', filters=[{'id': py7zr.FILTER_LZMA2, 'preset': 7}]) as sz:
                # 添加文件到7z
                sz.write(input_path, os.path.basename(input_path))
                
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
        finally:
            # 清理临时目录
            shutil.rmtree(temp_dir, ignore_errors=True)
            
        if self.progress_callback:
            final_size = os.path.getsize(output_path)
            compression_ratio = (1 - final_size / self.original_size) * 100
            time_elapsed = time.time() - self.start_time
            
            await self.progress_callback({
                'type': 'complete',
                'filename': os.path.basename(output_path),
                'originalSize': self.original_size,
                'compressedSize': final_size,
                'compressionRatio': compression_ratio,
                'timeElapsed': time_elapsed
            })
            
    def decompress(self, input_path, output_path):
        with py7zr.SevenZipFile(input_path, 'r') as sz:
            sz.extractall(os.path.dirname(output_path)) 