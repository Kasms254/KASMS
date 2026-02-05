import { useSentenceCase } from '../hooks/useSentenceCase'

/**
 * Component wrapper that applies sentence case to its children
 * Usage:
 * <SentenceCase>HELLO WORLD</SentenceCase> → "Hello world"
 * <SentenceCase preserveAcronyms>HELLO API WORLD</SentenceCase> → "Hello API world"
 */
export function SentenceCase({ children, preserveAcronyms = false, as: Component = 'span' }) {
  const text = typeof children === 'string' ? children : String(children || '')
  const transformed = useSentenceCase(text, { preserveAcronyms })

  return <Component>{transformed}</Component>
}

/**
 * Higher-order component that wraps a component and transforms specific props to sentence case
 * Usage:
 * const SentenceCaseButton = withSentenceCase(Button, ['label', 'title'])
 */
export function withSentenceCase(WrappedComponent, propsToTransform = []) {
  return function SentenceCaseWrapper(props) {
    const transformedProps = { ...props }

    propsToTransform.forEach(propName => {
      if (typeof props[propName] === 'string') {
        transformedProps[propName] = useSentenceCase(props[propName])
      }
    })

    return <WrappedComponent {...transformedProps} />
  }
}
