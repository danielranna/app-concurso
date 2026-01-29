"use client"

import { createContext, useContext, useState, useCallback, ReactNode } from "react"

type Subject = {
  id: string
  name: string
}

type ErrorType = {
  id: string
  name: string
}

type ErrorStatus = {
  id: string
  name: string
  color?: string | null
}

type Error = {
  id: string
  error_text: string
  correction_text: string
  description?: string
  reference_link?: string
  error_status?: string
  error_type?: string
  created_at: string
  topics: {
    id: string
    name: string
    subject_id: string
    subjects: {
      id: string
      name: string
    }
  }
}

type CacheData = {
  subjects: Map<string, Subject[]>
  errorTypes: Map<string, ErrorType[]>
  errorStatuses: Map<string, ErrorStatus[]>
  errors: Map<string, Error[]>
  timestamps: {
    subjects: Map<string, number>
    errorTypes: Map<string, number>
    errorStatuses: Map<string, number>
    errors: Map<string, number>
  }
}

type DataCacheContextType = {
  // Subjects
  getSubjects: (userId: string) => Promise<Subject[]>
  invalidateSubjects: (userId: string) => void
  
  // Error Types
  getErrorTypes: (userId: string) => Promise<ErrorType[]>
  invalidateErrorTypes: (userId: string) => void
  
  // Error Statuses
  getErrorStatuses: (userId: string) => Promise<ErrorStatus[]>
  invalidateErrorStatuses: (userId: string) => void
  
  // Errors
  getErrors: (userId: string, params?: {
    subject_id?: string
    topic_ids?: string[]
    error_types?: string[]
    error_statuses?: string[]
  }) => Promise<Error[]>
  invalidateErrors: (userId: string, subjectId?: string) => void
  
  // Invalidate all for a user
  invalidateAll: (userId: string) => void
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined)

const CACHE_DURATION = {
  subjects: 5 * 60 * 1000, // 5 minutos
  errorTypes: 5 * 60 * 1000, // 5 minutos
  errorStatuses: 5 * 60 * 1000, // 5 minutos
  errors: 1 * 60 * 1000, // 1 minuto
}

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<CacheData>({
    subjects: new Map(),
    errorTypes: new Map(),
    errorStatuses: new Map(),
    errors: new Map(),
    timestamps: {
      subjects: new Map(),
      errorTypes: new Map(),
      errorStatuses: new Map(),
      errors: new Map(),
    },
  })

  const isCacheValid = useCallback((key: string, type: keyof typeof CACHE_DURATION): boolean => {
    const timestamp = cache.timestamps[type].get(key)
    if (!timestamp) return false
    
    const now = Date.now()
    const duration = CACHE_DURATION[type]
    return (now - timestamp) < duration
  }, [cache])

  const getCacheKey = useCallback((userId: string, params?: Record<string, any>): string => {
    if (!params || Object.keys(params).length === 0) {
      return userId
    }
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${Array.isArray(params[key]) ? params[key].sort().join(',') : params[key]}`)
      .join('|')
    return `${userId}|${sortedParams}`
  }, [])

  // Subjects
  const getSubjects = useCallback(async (userId: string): Promise<Subject[]> => {
    const cacheKey = userId
    
    if (isCacheValid(cacheKey, 'subjects')) {
      const cached = cache.subjects.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const res = await fetch(`/api/subjects?user_id=${userId}`)
    const data = await res.json()
    
    setCache(prev => ({
      ...prev,
      subjects: new Map(prev.subjects).set(cacheKey, data),
      timestamps: {
        ...prev.timestamps,
        subjects: new Map(prev.timestamps.subjects).set(cacheKey, Date.now()),
      },
    }))

    return data
  }, [cache, isCacheValid])

  const invalidateSubjects = useCallback((userId: string) => {
    setCache(prev => {
      const newSubjects = new Map(prev.subjects)
      const newTimestamps = new Map(prev.timestamps.subjects)
      newSubjects.delete(userId)
      newTimestamps.delete(userId)
      return {
        ...prev,
        subjects: newSubjects,
        timestamps: {
          ...prev.timestamps,
          subjects: newTimestamps,
        },
      }
    })
  }, [])

  // Error Types
  const getErrorTypes = useCallback(async (userId: string): Promise<ErrorType[]> => {
    const cacheKey = userId
    
    if (isCacheValid(cacheKey, 'errorTypes')) {
      const cached = cache.errorTypes.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    try {
      const res = await fetch(`/api/error-types?user_id=${userId}`)
      if (!res.ok) {
        return []
      }
      const data = await res.json()
      
      setCache(prev => ({
        ...prev,
        errorTypes: new Map(prev.errorTypes).set(cacheKey, data),
        timestamps: {
          ...prev.timestamps,
          errorTypes: new Map(prev.timestamps.errorTypes).set(cacheKey, Date.now()),
        },
      }))

      return data ?? []
    } catch (error) {
      console.error("Erro ao carregar tipos de erro:", error)
      return []
    }
  }, [cache, isCacheValid])

  const invalidateErrorTypes = useCallback((userId: string) => {
    setCache(prev => {
      const newErrorTypes = new Map(prev.errorTypes)
      const newTimestamps = new Map(prev.timestamps.errorTypes)
      newErrorTypes.delete(userId)
      newTimestamps.delete(userId)
      return {
        ...prev,
        errorTypes: newErrorTypes,
        timestamps: {
          ...prev.timestamps,
          errorTypes: newTimestamps,
        },
      }
    })
  }, [])

  // Error Statuses
  const getErrorStatuses = useCallback(async (userId: string): Promise<ErrorStatus[]> => {
    const cacheKey = userId
    
    if (isCacheValid(cacheKey, 'errorStatuses')) {
      const cached = cache.errorStatuses.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    try {
      const res = await fetch(`/api/error-statuses?user_id=${userId}`)
      if (!res.ok) {
        return []
      }
      const data = await res.json()
      
      const statuses = (data ?? []).map((item: any, index: number) => {
        if (typeof item === 'string') {
          return { id: `status-${index}`, name: item, color: null }
        }
        return {
          id: item.id || `status-${index}`,
          name: item.name || item,
          color: item.color || null,
        }
      })
      
      setCache(prev => ({
        ...prev,
        errorStatuses: new Map(prev.errorStatuses).set(cacheKey, statuses),
        timestamps: {
          ...prev.timestamps,
          errorStatuses: new Map(prev.timestamps.errorStatuses).set(cacheKey, Date.now()),
        },
      }))

      return statuses
    } catch (error) {
      console.error("Erro ao carregar status de erro:", error)
      return []
    }
  }, [cache, isCacheValid])

  const invalidateErrorStatuses = useCallback((userId: string) => {
    setCache(prev => {
      const newErrorStatuses = new Map(prev.errorStatuses)
      const newTimestamps = new Map(prev.timestamps.errorStatuses)
      newErrorStatuses.delete(userId)
      newTimestamps.delete(userId)
      return {
        ...prev,
        errorStatuses: newErrorStatuses,
        timestamps: {
          ...prev.timestamps,
          errorStatuses: newTimestamps,
        },
      }
    })
  }, [])

  // Errors
  const getErrors = useCallback(async (
    userId: string,
    params?: {
      subject_id?: string
      topic_ids?: string[]
      error_types?: string[]
      error_statuses?: string[]
    }
  ): Promise<Error[]> => {
    const cacheKey = getCacheKey(userId, params)
    
    if (isCacheValid(cacheKey, 'errors')) {
      const cached = cache.errors.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const urlParams = new URLSearchParams({ user_id: userId })
    if (params?.subject_id) urlParams.set('subject_id', params.subject_id)
    if (params?.topic_ids) params.topic_ids.forEach(id => urlParams.append('topic_id', id))
    if (params?.error_types) params.error_types.forEach(type => urlParams.append('error_type', type))
    if (params?.error_statuses) params.error_statuses.forEach(status => urlParams.append('error_status', status))

    const res = await fetch(`/api/errors?${urlParams.toString()}`)
    const data = await res.json()
    
    setCache(prev => ({
      ...prev,
      errors: new Map(prev.errors).set(cacheKey, data ?? []),
      timestamps: {
        ...prev.timestamps,
        errors: new Map(prev.timestamps.errors).set(cacheKey, Date.now()),
      },
    }))

    return data ?? []
  }, [cache, isCacheValid, getCacheKey])

  const invalidateErrors = useCallback((userId: string, subjectId?: string) => {
    setCache(prev => {
      const newErrors = new Map(prev.errors)
      const newTimestamps = new Map(prev.timestamps.errors)
      
      // Remove todas as entradas de cache de erros para este usuário
      // Se subjectId for fornecido, remove apenas as relacionadas
      for (const [key] of prev.errors) {
        if (key.startsWith(userId)) {
          if (!subjectId || key.includes(`subject_id:${subjectId}`)) {
            newErrors.delete(key)
            newTimestamps.delete(key)
          }
        }
      }
      
      return {
        ...prev,
        errors: newErrors,
        timestamps: {
          ...prev.timestamps,
          errors: newTimestamps,
        },
      }
    })
  }, [])

  const invalidateAll = useCallback((userId: string) => {
    invalidateSubjects(userId)
    invalidateErrorTypes(userId)
    invalidateErrorStatuses(userId)
    invalidateErrors(userId)
  }, [invalidateSubjects, invalidateErrorTypes, invalidateErrorStatuses, invalidateErrors])

  return (
    <DataCacheContext.Provider
      value={{
        getSubjects,
        invalidateSubjects,
        getErrorTypes,
        invalidateErrorTypes,
        getErrorStatuses,
        invalidateErrorStatuses,
        getErrors,
        invalidateErrors,
        invalidateAll,
      }}
    >
      {children}
    </DataCacheContext.Provider>
  )
}

export function useDataCache() {
  const context = useContext(DataCacheContext)
  if (context === undefined) {
    throw new Error("useDataCache must be used within a DataCacheProvider")
  }
  return context
}
