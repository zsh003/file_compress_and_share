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
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes


class AESCipher:
    def __init__(self, key=None):
        """
        初始化AES加密器，如果未提供密钥则生成一个随机密钥
        """
        if key is None:
            self.key = get_random_bytes(16)  # AES-128
        else:
            self.key = key
            
    def encrypt(self, data):
        """
        加密数据
        """
        iv = get_random_bytes(16)
        cipher = AES.new(self.key, AES.MODE_CBC, iv)
        padded_data = pad(data, AES.block_size)
        encrypted_data = cipher.encrypt(padded_data)
        return iv + encrypted_data
    
    def decrypt(self, data):
        """
        解密数据
        """
        iv = data[:16]
        encrypted_data = data[16:]
        cipher = AES.new(self.key, AES.MODE_CBC, iv)
        padded_data = cipher.decrypt(encrypted_data)
        return unpad(padded_data, AES.block_size)
    
    def get_key_base64(self):
        """
        返回base64编码的密钥
        """
        return base64.b64encode(self.key).decode('utf-8')
    
    @classmethod
    def from_base64_key(cls, key_base64):
        """
        从base64编码的密钥创建AESCipher实例
        """
        key = base64.b64decode(key_base64)
        return cls(key)


class BaseCompressor:
    def __init__(self):
        self._progress_callback = None
        self._start_time = None
        self.cipher = AESCipher()  # 默认创建一个新的密钥

    def set_progress_callback(self, callback: Callable):
        self._progress_callback = callback
    
    def set_encryption_key(self, key_base64=None):
        """
        设置加密密钥，如果未提供则使用默认生成的
        """
        if key_base64:
            self.cipher = AESCipher.from_base64_key(key_base64)
        else:
            self.cipher = AESCipher()  # 生成新密钥
            
    def get_encryption_key(self):
        """
        获取当前加密密钥的base64表示
        """
        return self.cipher.get_key_base64()

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

    async def _report_completion(self, final_size: int, original_size: int, encryption_key=None):
        if self._progress_callback:
            elapsed_time = time.time() - self._start_time
            details = {
                'original_size': original_size,
                'current_size': final_size,
                'speed': 0,
                'time_elapsed': round(elapsed_time, 2)
            }
            
            # 如果有加密密钥，添加到完成消息中
            if encryption_key:
                details['encryption_key'] = encryption_key
                
            await self._progress_callback({
                'type': 'completed',
                'progress': 100,
                'details': details
            })

    async def encrypt_file(self, input_path, output_path):
        """
        加密文件并将其保存到输出路径
        """
        with open(input_path, 'rb') as f:
            data = f.read()
        
        encrypted_data = self.cipher.encrypt(data)
        
        with open(output_path, 'wb') as f:
            f.write(encrypted_data)
            
        return self.cipher.get_key_base64()
    
    async def decrypt_file(self, input_path, output_path, key_base64=None):
        """
        解密文件并将其保存到输出路径
        """
        # 检查文件的前16字节是否为IV，这是加密文件的特征
        with open(input_path, 'rb') as f:
            header = f.read(16)
            f.seek(0)  # 重置文件指针
            encrypted_data = f.read()
            
        # 检查是否需要解密
        is_encrypted = True
        try:
            # 尝试解析IV，如果失败则可能不是加密文件
            iv = header
            # 简单检查，判断IV是否有效
            if all(b == 0 for b in iv) or all(b == 255 for b in iv):
                is_encrypted = False
                print("文件可能未加密，尝试直接处理")
        except Exception:
            is_encrypted = False
            print("无法解析IV，假设文件未加密")
            
        if not is_encrypted:
            # 直接复制文件
            with open(output_path, 'wb') as f:
                f.write(encrypted_data)
            return True
            
        # 文件确认需要解密但未提供密钥
        if is_encrypted and not key_base64:
            print("文件需要解密但未提供密钥")
            return False
            
        # 设置解密密钥
        if key_base64:
            self.set_encryption_key(key_base64)
            
        try:
            decrypted_data = self.cipher.decrypt(encrypted_data)
            
            with open(output_path, 'wb') as f:
                f.write(decrypted_data)
                
            return True
        except Exception as e:
            print(f"解密失败: {str(e)}")
            return False

class LZ77Compressor(BaseCompressor):
    def __init__(self, window_size=4096, look_ahead_size=128):
        super().__init__()
        self.window_size = window_size
        self.look_ahead_size = look_ahead_size

    async def compress(self, input_path: str, output_path: str):
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)

        # 创建临时文件用于压缩
        temp_compressed_path = f"{output_path}.temp"

        with open(input_path, 'rb') as file:
            data = file.read()

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

        # 将压缩数据写入临时文件
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
        with open(temp_compressed_path, 'wb') as file:
            file.write(result)

        # 对压缩后的文件进行AES加密
        encryption_key = await self.encrypt_file(temp_compressed_path, output_path)
        
        # 删除临时文件
        os.remove(temp_compressed_path)

        # 报告完成，包含加密密钥
        final_size = os.path.getsize(output_path)
        await self._report_completion(final_size, original_size, encryption_key)

    async def decompress(self, input_path: str, output_path: str, encryption_key=None):
        self._start_time = time.time()
        
        # 创建临时文件用于解密
        temp_decrypted_path = f"{input_path}.decrypted"
        
        # 先解密文件
        decrypt_success = await self.decrypt_file(input_path, temp_decrypted_path, encryption_key)
        if not decrypt_success:
            raise Exception("解密失败，文件可能需要密钥")
        
        # 读取解密后的数据
        with open(temp_decrypted_path, 'rb') as file:
            data = file.read()

        decompressed_data = bytearray()
        i = 0
        
        try:
            while i < len(data):
                if data[i] != 0xFF:
                    offset = int.from_bytes(data[i:i + 2], "big")
                    length = data[i + 2]
                    # 复制匹配内容
                    if offset != 0 and length != 0:
                        start = len(decompressed_data) - offset
                        for j in range(length):
                            decompressed_data.append(decompressed_data[start + j])
                    next_char = data[i + 3]
                    decompressed_data.append(next_char)
                    i += 4
                else:
                    offset = int.from_bytes(data[i + 1:i + 3], "big")
                    length = data[i + 3]
                    # 复制匹配内容
                    start = len(decompressed_data) - offset
                    for j in range(length):
                        decompressed_data.append(decompressed_data[start + j])
                    i += 4
        except Exception as e:
            print(f"LZ77解压错误：{str(e)}")
            raise Exception(f"LZ77解压失败：{str(e)}")

        with open(output_path, 'wb') as file:
            file.write(decompressed_data)
            
        # 删除临时文件
        os.remove(temp_decrypted_path)

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
        
        # 创建临时文件用于压缩
        temp_compressed_path = f"{output_path}.temp"
        
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

        # 将压缩结果写入临时文件
        with open(temp_compressed_path, 'wb') as file:
            file.write(bytes(b))

        # 对压缩后的文件进行AES加密
        encryption_key = await self.encrypt_file(temp_compressed_path, output_path)
        
        # 删除临时文件
        os.remove(temp_compressed_path)

        # 报告完成，包含加密密钥
        final_size = os.path.getsize(output_path)
        await self._report_completion(final_size, original_size, encryption_key)

    async def decompress(self, input_path: str, output_path: str, encryption_key=None):
        self._start_time = time.time()
        
        # 创建临时文件用于解密
        temp_decrypted_path = f"{input_path}.decrypted"
        
        # 先解密文件
        decrypt_success = await self.decrypt_file(input_path, temp_decrypted_path, encryption_key)
        if not decrypt_success:
            raise Exception("解密失败，文件可能需要密钥")
        
        try:
            # 读取解密后的数据
            with open(temp_decrypted_path, 'rb') as file:
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
        except Exception as e:
            print(f"哈夫曼解压错误: {str(e)}")
            raise Exception(f"哈夫曼解压失败: {str(e)}")

        with open(output_path, 'wb') as file:
            file.write(bytes(decompressed_data))
            
        # 删除临时文件
        os.remove(temp_decrypted_path)

class ZipCompressor(BaseCompressor):
    async def compress(self, input_path: str, output_path: str):
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)
        
        # 创建临时文件用于压缩
        temp_compressed_path = f"{output_path}.temp"
        
        with zipfile.ZipFile(temp_compressed_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.write(input_path, os.path.basename(input_path))
            
        # 对压缩后的文件进行AES加密
        encryption_key = await self.encrypt_file(temp_compressed_path, output_path)
        
        # 删除临时文件
        os.remove(temp_compressed_path)

        # 报告完成，包含加密密钥
        final_size = os.path.getsize(output_path)
        await self._report_completion(final_size, original_size, encryption_key)

    async def decompress(self, input_path: str, output_path: str, encryption_key=None):
        self._start_time = time.time()
        
        # 创建临时文件和目录
        temp_decrypted_path = f"{input_path}.decrypted"
        temp_dir = tempfile.mkdtemp()
        
        try:
            # 先解密文件
            decrypt_success = await self.decrypt_file(input_path, temp_decrypted_path, encryption_key)
            if not decrypt_success:
                raise Exception("解密失败，文件可能需要密钥")
            
            try:
                # 使用zipfile解压
                with zipfile.ZipFile(temp_decrypted_path, 'r') as zip_file:
                    zip_file.extractall(temp_dir)
                    
                    # 获取zip中的第一个文件
                    extracted_files = os.listdir(temp_dir)
                    if not extracted_files:
                        raise Exception("解压缩后没有文件")
                        
                    # 将解压出的第一个文件移动到目标路径
                    source_file = os.path.join(temp_dir, extracted_files[0])
                    shutil.copy2(source_file, output_path)
            except zipfile.BadZipFile as e:
                raise Exception(f"无效的ZIP文件: {str(e)}")
            except Exception as e:
                raise Exception(f"ZIP解压错误: {str(e)}")
        finally:
            # 清理临时文件和目录
            if os.path.exists(temp_decrypted_path):
                os.remove(temp_decrypted_path)
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)

class CombinedCompressor(BaseCompressor):
    def __init__(self):
        super().__init__()
        self.lz77 = LZ77Compressor()
        self.huffman = HuffmanCompressor()
        self.cipher = AESCipher()  # 创建AES加密器

    def set_progress_callback(self, callback):
        self._progress_callback = callback
        self.lz77.set_progress_callback(callback)
        self.huffman.set_progress_callback(callback)

    async def compress(self, input_path, output_path):
        # 创建临时文件路径
        temp_dir = tempfile.mkdtemp()
        temp_lz77_path = os.path.join(temp_dir, "temp_lz77")
        temp_final_path = os.path.join(temp_dir, "temp_final")
        
        self._start_time = time.time()
        original_size = os.path.getsize(input_path)

        try:
            # 先使用LZ77压缩
            await self.lz77.compress(input_path, temp_lz77_path)
            
            # 再使用哈夫曼压缩
            await self.huffman.compress(temp_lz77_path, temp_final_path)
            
            # 最后进行AES加密
            encryption_key = await self.encrypt_file(temp_final_path, output_path)
            
            # 报告完成，包含加密密钥
            final_size = os.path.getsize(output_path)
            await self._report_completion(final_size, original_size, encryption_key)
            
        finally:
            # 清理临时文件
            if os.path.exists(temp_lz77_path):
                os.remove(temp_lz77_path)
            if os.path.exists(temp_final_path):
                os.remove(temp_final_path)
            if os.path.exists(temp_dir):
                os.rmdir(temp_dir)

    async def decompress(self, input_path, output_path, encryption_key=None):
        # 创建临时文件路径
        temp_dir = tempfile.mkdtemp()
        temp_decrypted_path = os.path.join(temp_dir, "temp_decrypted")
        temp_huffman_path = os.path.join(temp_dir, "temp_huffman")
        
        self._start_time = time.time()
        
        try:
            # 先解密
            decrypt_success = await self.decrypt_file(input_path, temp_decrypted_path, encryption_key)
            if not decrypt_success:
                raise Exception("解密失败，文件可能需要密钥")
            
            try:
                # 再用哈夫曼解压
                await self.huffman.decompress(temp_decrypted_path, temp_huffman_path)
                
                # 最后用LZ77解压
                await self.lz77.decompress(temp_huffman_path, output_path)
            except Exception as e:
                raise Exception(f"组合解压失败: {str(e)}")
                
        finally:
            # 清理临时文件
            if os.path.exists(temp_decrypted_path):
                os.remove(temp_decrypted_path)
            if os.path.exists(temp_huffman_path):
                os.remove(temp_huffman_path)
            if os.path.exists(temp_dir):
                try:
                    os.rmdir(temp_dir)
                except:
                    pass

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