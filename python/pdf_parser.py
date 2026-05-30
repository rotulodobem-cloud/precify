"""
Precify — PDF Parser Service
Serviço Python que extrai tabelas de listas de preços de fornecedores.
Roda na porta 5001 e é chamado pelo Next.js quando o usuário sobe um PDF.

Instalar dependências:
  pip install flask pdfplumber

Iniciar:
  python python/pdf_parser.py
"""

from flask import Flask, request, jsonify
import pdfplumber
import re
import io
import os

app = Flask(__name__)

def limpar_preco(texto):
    """Converte texto de preço brasileiro para float. Ex: 'R$ 1.234,56' -> 1234.56"""
    if not texto:
        return None
    texto = re.sub(r'[R$\s]', '', str(texto))
    texto = texto.replace('.', '').replace(',', '.')
    try:
        valor = float(texto)
        return valor if 0.5 <= valor <= 100000 else None
    except:
        return None

def extrair_embalagem(descricao):
    """Extrai embalagem do nome do produto. Ex: 'CHIA 25KG' -> '25KG'"""
    match = re.search(r'\b(\d+(?:[xX]\d+)?(?:[.,]\d+)?\s*(?:KG|G|ML|L|UN))\b', descricao, re.I)
    return match.group(1).upper() if match else None

def parsear_tabela(rows, colunas):
    """
    Tenta identificar e parsear colunas de uma tabela de preços.
    Detecta automaticamente quais colunas têm descrição, código e preço.
    """
    itens = []
    
    # Detecta índices das colunas relevantes
    idx_desc = None
    idx_cod  = None
    idx_preco = None
    
    if colunas:
        for i, col in enumerate(colunas):
            col_lower = str(col or '').lower()
            if any(x in col_lower for x in ['descri', 'nome', 'produto', 'item']):
                idx_desc = i
            elif any(x in col_lower for x in ['cod', 'código', 'ref']):
                idx_cod = i
            elif any(x in col_lower for x in ['vista', 'preco', 'preço', 'valor', 'desconto']):
                if idx_preco is None:  # pega o primeiro preço encontrado
                    idx_preco = i
        
        # Se não encontrou pelo cabeçalho, assume primeira coluna = descrição
        if idx_desc is None:
            idx_desc = 0
    
    for row in rows:
        if not row or all(c is None or str(c).strip() == '' for c in row):
            continue
        
        cells = [str(c or '').strip() for c in row]
        
        # Pega descrição
        desc = cells[idx_desc] if idx_desc is not None and idx_desc < len(cells) else cells[0] if cells else ''
        if not desc or len(desc) < 3 or len(desc) > 100:
            continue
        
        # Ignora linhas de cabeçalho repetidas
        if any(x in desc.lower() for x in ['descrição', 'produto', 'item', 'total', 'subtotal']):
            continue
        
        # Pega código
        codigo = None
        if idx_cod is not None and idx_cod < len(cells):
            cod_raw = cells[idx_cod]
            if re.match(r'^\d{1,6}$', cod_raw):
                codigo = cod_raw
        
        # Se não encontrou código por coluna, tenta extrair da descrição ou linha toda
        if not codigo:
            # Procura número isolado de 1-5 dígitos no meio da linha
            for cell in cells[1:]:
                if re.match(r'^\d{1,5}$', cell.strip()):
                    codigo = cell.strip()
                    break
        
        # Pega preço — prioriza coluna "à vista", senão pega último preço válido
        preco = None
        if idx_preco is not None and idx_preco < len(cells):
            preco = limpar_preco(cells[idx_preco])
        
        if preco is None:
            # Tenta todas as células da direita para esquerda
            for cell in reversed(cells):
                p = limpar_preco(cell)
                if p:
                    preco = p
                    break
        
        embalagem = extrair_embalagem(desc)
        
        itens.append({
            'descricao': desc,
            'codigo': codigo,
            'preco': preco,
            'embalagem': embalagem,
        })
    
    return itens

@app.route('/parsear-pdf', methods=['POST'])
def parsear_pdf():
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    
    arquivo = request.files['file']
    if not arquivo.filename or not arquivo.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Arquivo deve ser PDF'}), 400
    
    try:
        conteudo = arquivo.read()
        itens_total = []
        paginas_processadas = 0
        
        with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
            for pagina in pdf.pages:
                paginas_processadas += 1
                
                # Tenta extrair tabelas estruturadas primeiro (mais preciso)
                tabelas = pagina.extract_tables()
                
                if tabelas:
                    for tabela in tabelas:
                        if len(tabela) < 2:
                            continue
                        # Primeira linha é cabeçalho
                        colunas = tabela[0]
                        linhas  = tabela[1:]
                        itens_pagina = parsear_tabela(linhas, colunas)
                        itens_total.extend(itens_pagina)
                else:
                    # Fallback: extrai texto e tenta parsear
                    texto = pagina.extract_text() or ''
                    for linha in texto.split('\n'):
                        linha = linha.strip()
                        if len(linha) < 5:
                            continue
                        precos = re.findall(r'\d{1,3}(?:\.\d{3})*,\d{2}', linha)
                        if not precos:
                            continue
                        preco = limpar_preco(precos[-1])
                        if not preco:
                            continue
                        # Remove preços da linha
                        sem_preco = linha
                        for p in precos:
                            sem_preco = sem_preco.replace(p, '')
                        sem_preco = re.sub(r'R\$\s*', '', sem_preco).strip()
                        # Extrai código
                        cod_match = re.match(r'^(.+?)\s+(\d{1,5})\s+(SC|PC|CX|FD|UN|KG)?\s*$', sem_preco, re.I)
                        if cod_match:
                            desc   = cod_match.group(1).strip()
                            codigo = cod_match.group(2)
                            emb    = cod_match.group(3)
                        else:
                            desc   = re.sub(r'\s+\d{1,5}\s*$', '', sem_preco).strip()
                            codigo = None
                            emb    = None
                        if len(desc) >= 3:
                            itens_total.append({
                                'descricao': desc,
                                'codigo': codigo,
                                'preco': preco,
                                'embalagem': emb or extrair_embalagem(desc),
                            })
        
        # Remove duplicatas (mesmo código ou mesma descrição+preço)
        vistos = set()
        itens_unicos = []
        for item in itens_total:
            chave = item['codigo'] or (item['descricao'][:30] + str(item['preco']))
            if chave not in vistos:
                vistos.add(chave)
                itens_unicos.append(item)
        
        return jsonify({
            'paginas': paginas_processadas,
            'itensExtraidos': len(itens_unicos),
            'itens': itens_unicos,
        })
    
    except Exception as e:
        return jsonify({'error': f'Erro ao processar PDF: {str(e)}'}), 500

@app.route('/saude', methods=['GET'])
def saude():
    return jsonify({'status': 'ok', 'servico': 'Precify PDF Parser'})

if __name__ == '__main__':
    porta = int(os.environ.get('PDF_PORT', 5001))
    print(f'🐍 Precify PDF Parser rodando na porta {porta}')
    app.run(host='0.0.0.0', port=porta, debug=False)
