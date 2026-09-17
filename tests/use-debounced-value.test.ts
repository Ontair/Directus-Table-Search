import { effectScope, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from '../src/composables/use-debounced-value';

afterEach(() => {
	vi.useRealTimers();
});

describe('useDebouncedValue', () => {
	it('keeps the last applied value while input is changing and applies only the latest value', async () => {
		vi.useFakeTimers();
		const scope = effectScope();
		const source = ref('');
		const applied = scope.run(() => useDebouncedValue(() => source.value, 300))!;

		source.value = 'с';
		await nextTick();
		source.value = 'си';
		await nextTick();
		source.value = 'сигма';
		await nextTick();

		expect(applied.value).toBe('');
		vi.advanceTimersByTime(299);
		expect(applied.value).toBe('');
		vi.advanceTimersByTime(1);
		expect(applied.value).toBe('сигма');

		scope.stop();
	});
});
