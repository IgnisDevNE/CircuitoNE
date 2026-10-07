import { useState } from 'react'
import { ESTADOS } from '../../data/types'
import { municipiosDe } from '../../lib/municipios'
import { Select } from './form'

export interface LocationFieldsProps {
  /** `name` dos campos enviados (UF e cidade). */
  ufName: string
  cityName: string
  ufLabel?: string
  cityLabel?: string
  /** Valores iniciais; a cidade só vale se existir na UF. */
  defaultUf?: string
  defaultCity?: string
  ufError?: string
  cityError?: string
  /** Mostra só a sigla nas opções de UF (campos estreitos). */
  shortUf?: boolean
  required?: boolean
}

/**
 * UF primeiro, depois a cidade: a lista de cidades é a do estado escolhido (municípios oficiais do IBGE, os mesmos do
 * banco). Trocar a UF limpa a cidade. Sem JavaScript a lista fica a do estado inicial; o servidor recusa uma cidade que
 * não pertença à UF enviada e a página volta já com a lista do estado escolhido. Devolve os dois campos lado a lado
 * (fragmento), para o formulário dispor na grade.
 */
export function LocationFields({
  ufName,
  cityName,
  ufLabel = 'Estado',
  cityLabel = 'Cidade',
  defaultUf = '',
  defaultCity = '',
  ufError,
  cityError,
  shortUf = false,
  required = true,
}: LocationFieldsProps) {
  const [uf, setUf] = useState(defaultUf)
  const [city, setCity] = useState(defaultCity)
  const cities = municipiosDe(uf)
  return (
    <>
      <Select
        label={ufLabel}
        name={ufName}
        value={uf}
        onChange={(event) => {
          setUf(event.target.value)
          setCity('')
        }}
        error={ufError}
        required={required}
        autoComplete="address-level1"
        options={[{ value: '', label: 'Selecione' }, ...ESTADOS.map((estado) => ({ value: estado.value, label: shortUf ? estado.value : estado.label }))]}
      />
      <Select
        label={cityLabel}
        name={cityName}
        value={cities.includes(city) ? city : ''}
        onChange={(event) => setCity(event.target.value)}
        error={cityError}
        required={required}
        autoComplete="address-level2"
        options={[{ value: '', label: uf ? 'Selecione a cidade' : 'Escolha o estado primeiro' }, ...cities.map((name) => ({ value: name, label: name }))]}
      />
    </>
  )
}
