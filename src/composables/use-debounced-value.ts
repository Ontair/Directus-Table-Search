import { onScopeDispose, shallowRef, watch, type Ref } from 'vue';

export function useDebouncedValue<T>(source: () => T, delayMs: number): Ref<T> {
	const value = shallowRef(source()) as Ref<T>;
	let timer: ReturnType<typeof setTimeout> | undefined;

	watch(
		source,
		(nextValue) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				value.value = nextValue;
				timer = undefined;
			}, delayMs);
		},
		{ flush: 'post' },
	);

	onScopeDispose(() => {
		if (timer) clearTimeout(timer);
	});

	return value;
}
