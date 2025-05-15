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
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad


class AESCrypto:
    def __init__(self, key=b'ThisIsA16ByteKey', iv=b'ThisIsA16ByteIV.'):
        self.key = key
        self.iv = iv
        
    def encrypt(self, data):
        cipher = AES.new(self.key, AES.MODE_CBC, self.iv)
        return cipher.encrypt(pad(data, AES.block_size))
        
    def decrypt(self, data):
        cipher = AES.new(self.key, AES.MODE_CBC, self.iv)
        return unpad(cipher.decrypt(data), AES.block_size)


class BaseCompressor:
    def __init__(self):
        self._progress_callback = None
        self._start_time = None
        self.crypto = AESCrypto()

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
    def __init__(self, window_size=4096, look_ahead_size=128):
        super().__init__()
        self.window_size = window_size
        self.look_ahead_size = look_ahead_size

    async def compress(self, input_path: str, output_path: str):
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)

        with open(input_path, 'rb') as file:
            data = file.read()
            
        # 加密数据
        encrypted_data = self.crypto.encrypt(data)
        data = encrypted_data

        compressed_data = []
        current_pos = 0
        total_positions = len(data)

        while current_pos < len(data):
            # 查找最长匹配
            match_length = 0
            match_offset = 0

            start = max(0, current_pos - self.window_size)
            window = data[start:current_pos]
            lookahead = data[current_pos:current_pos + self.look_ahead_size]

            # 最大长度匹配
            for l in range(len(lookahead), 0, -1):
                match_string = data[current_pos:current_pos + l]

                try:
                    of = window.rindex(match_string)
                except ValueError:
                    continue

                match_length = l  # 实际length
                match_offset = current_pos - start - of  # 实际offset
                break

            if match_length > 0:
                if current_pos + match_length < len(data):
                    compressed_data.append((match_offset, match_length, data[current_pos + match_length]))
                else:
                    compressed_data.append((match_offset, match_length))
                current_pos += match_length + 1
            else:
                compressed_data.append((0, 0, data[current_pos]))
                current_pos += 1

            # 每处理1%的数据就更新一次进度
            if current_pos % (total_positions // 100) == 0 or current_pos == total_positions:
                progress = current_pos / total_positions
                current_size = len(compressed_data) * 4  # 估算压缩后大小
                await self._report_progress(progress, current_size, original_size)

        # 将压缩数据写入文件
        result = bytearray()
        for item in compressed_data:
            if len(item) == 3:
                offset, length, next_char = item
                result.extend(offset.to_bytes(2, 'big'))
                result.append(length)
                result.append(next_char)
            else:
                offset, length = item
                result.append(0xFF)  # 特殊标记
                result.extend(offset.to_bytes(2, 'big'))
                result.append(length)
        with open(output_path, 'wb') as file:
            file.write(result)

        # 报告完成
        final_size = os.path.getsize(output_path)
        await self._report_completion(final_size, original_size)

    async def decompress(self, input_path: str, output_path: str):
        with open(input_path, 'rb') as file:
            data = file.read()

        decompressed_data = bytearray()
        i = 0
        while i < len(data):
            if data[i] != 0xFF:
                # print("No 0xFF")
                offset = int.from_bytes(data[i:i + 2], "big")
                length = data[i + 2]
                # print(f"offset={offset}, length={length}, len={len(result)}")
                # print(result)
                # 复制匹配内容
                if offset != 0 and length != 0:
                    start = len(decompressed_data) - offset
                    for j in range(length):
                        decompressed_data.append(decompressed_data[start + j])
                next_char = data[i + 3]
                decompressed_data.append(next_char)
                i += 4
            else:
                # print("0xFF")
                offset = int.from_bytes(data[i + 1:i + 3], "big")
                length = data[i + 3]
                # print(f"offset={offset}, length={length}, len={len(result)}")
                # print(result)
                # 复制匹配内容
                start = len(decompressed_data) - offset
                for j in range(length):
                    decompressed_data.append(decompressed_data[start + j])
                i += 4
        
        # 解密数据
        decrypted_data = self.crypto.decrypt(bytes(decompressed_data))
        decompressed_data = decrypted_data

        with open(output_path, 'wb') as file:
            file.write(decompressed_data)


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
            
        # 加密数据
        encrypted_text = self.crypto.encrypt(text)
        text = encrypted_text

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

            # 解密数据
            decrypted_data = self.crypto.decrypt(bytes(decompressed_data))
            
            # 保存解压后的数据
            with open(output_path, 'wb') as file:
                file.write(decrypted_data)


class ZipCompressor(BaseCompressor):
    async def compress(self, input_path: str, output_path: str):
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)
        
        try:
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                # 获取输入文件的基本名称
                base_name = os.path.basename(input_path)
                
                # 读取数据并加密
                with open(input_path, 'rb') as f:
                    data = f.read()
                    encrypted_data = self.crypto.encrypt(data)
                    total_size = len(data)
                    
                    # 将加密数据写入zip文件
                    zf.writestr(base_name, encrypted_data)
                    
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
        # 临时提取文件
        temp_dir = tempfile.mkdtemp()
        try:
            with zipfile.ZipFile(input_path, 'r') as zf:
                zf.extractall(path=temp_dir)
                
                # 解密解压后的文件
                extracted_file = os.path.join(temp_dir, os.path.basename(output_path))
                with open(extracted_file, 'rb') as f:
                    encrypted_data = f.read()
                    
                # 解密数据
                decrypted_data = self.crypto.decrypt(encrypted_data)
                
                # 写入解密后的数据
                with open(output_path, 'wb') as f:
                    f.write(decrypted_data)
        finally:
            # 清理临时目录
            shutil.rmtree(temp_dir, ignore_errors=True)

class CombinedCompressor:
    def __init__(self):
        self.lz77_compressor = LZ77Compressor()
        self.huffman_compressor = HuffmanCompressor()
        self.progress_callback = None

    def set_progress_callback(self, callback):
        self.progress_callback = callback
        self.lz77_compressor.set_progress_callback(callback)
        self.huffman_compressor.set_progress_callback(callback)

    async def compress(self, input_path, output_path):
        # 创建临时文件路径
        temp_path = f"{output_path}.temp"
        
        try:
            # 第一步：LZ77压缩
            await self.lz77_compressor.compress(input_path, temp_path)
            
            # 第二步：Huffman压缩
            await self.huffman_compressor.compress(temp_path, output_path)
            
            # 删除临时文件
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
        except Exception as e:
            # 确保清理临时文件
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise e

    async def decompress(self, input_path, output_path):
        # 创建临时文件路径
        temp_path = f"{output_path}.temp"
        
        try:
            # 第一步：Huffman解压
            await self.huffman_compressor.decompress(input_path, temp_path)
            
            # 第二步：LZ77解压
            await self.lz77_compressor.decompress(temp_path, output_path)
            
            # 删除临时文件
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
        except Exception as e:
            # 确保清理临时文件
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise e 
        
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