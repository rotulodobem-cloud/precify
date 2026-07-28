'use client'
import { useEffect, useState } from 'react'

/**
 * Segura o valor por `ms` antes de propagar. Usado nas buscas das listas
 * para não disparar um fetch por tecla digitada.
 */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [debounced, setDebounced] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return debounced
}
